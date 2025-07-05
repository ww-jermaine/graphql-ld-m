import { Algebra, Factory as SparqlAlgebraFactory, toSparql } from 'sparqlalgebrajs';
import { DataFactory as RdfDataFactoryClass } from 'rdf-data-factory'; // Aliased import
import {
  parse,
  visit,
  OperationDefinitionNode,
  FieldNode,
  ValueNode,
  ObjectValueNode,
  StringValueNode,
  Kind,
} from 'graphql';
import { JsonLdContextNormalized } from 'jsonld-context-parser';
import * as RDF from '@rdfjs/types';

/**
 * Extended DataFactory interface that includes variable creation
 */
interface ExtendedDataFactory extends RDF.DataFactory {
  variable(value: string): RDF.Variable;
}

/**
 * Converts GraphQL mutation strings into SPARQL UPDATE algebra.
 * It uses a JSON-LD context to map GraphQL fields and types to RDF IRIs.
 * Supports 'create', 'update', and 'delete' style mutations.
 */
export class MutationConverter {
  private readonly context: JsonLdContextNormalized;
  private readonly dataFactory: ExtendedDataFactory;
  private readonly sparqlAlgebraFactory: SparqlAlgebraFactory;

  /**
   * Constructs a new MutationConverter.
   * @param context The normalized JSON-LD context used for IRI mapping.
   * @param dataFactory Optional RDF.DataFactory instance for creating RDF terms.
   */
  constructor(context: JsonLdContextNormalized, dataFactory?: RDF.DataFactory) {
    this.context = context;
    const baseFactory = dataFactory || new RdfDataFactoryClass(); // Use aliased constructor

    // Extend the factory to include variable creation if it doesn't exist
    this.dataFactory = baseFactory as ExtendedDataFactory;

    // Add variable method if it doesn't exist
    if (!this.dataFactory.variable) {
      this.dataFactory.variable = (value: string): RDF.Variable => ({
        termType: 'Variable',
        value: value,
        equals: (other: RDF.Term): boolean =>
          other.termType === 'Variable' && other.value === value,
      });
    }

    this.sparqlAlgebraFactory = new SparqlAlgebraFactory(this.dataFactory);
  }

  /**
   * Converts a GraphQL mutation string into a SPARQL UPDATE algebra operation.
   *
   * The method parses the mutation string, identifies the operation type (create, update, delete)
   * based on the mutation field name (e.g., 'createUser', 'updateUser', 'deleteUser'),
   * and uses the JSON-LD context to map GraphQL fields and types to RDF IRIs.
   *
   * - For 'create' mutations, it generates an `INSERT DATA` operation.
   * - For 'update' mutations, it generates a `DELETE/INSERT WHERE` operation.
   * - For 'delete' mutations, it generates a `DELETE WHERE` operation.
   *
   * @param mutationString The GraphQL mutation string to convert.
   * @param _variables Optional GraphQL variables to substitute in the mutation.
   * @returns An `Algebra.Update` object representing the SPARQL UPDATE operation.
   * @throws Error if the mutation string is invalid, uses unsupported features,
   *               or if required mappings are not found in the JSON-LD context.
   */
  public convert(mutationString: string): Algebra.Update {
    const ast = parse(mutationString);
    let operation: Algebra.Update | null = null;

    // Visitor state
    let operationType: 'create' | 'update' | 'delete' | null = null;
    let entityTypeName: string | null = null; // E.g., "User" from "createUser"
    let subjectHint: RDF.NamedNode | RDF.BlankNode | null = null; // For create from input.id, or for update/delete from arg id

    const createQuads: RDF.Quad[] = [];
    const updateDeleteQuads: RDF.Quad[] = [];
    const updateInsertQuads: RDF.Quad[] = [];
    const updateWherePatterns: Algebra.Pattern[] = []; // WHERE clause still needs patterns for BGP
    const deleteQuads: RDF.Quad[] = [];
    const deleteWherePatterns: Algebra.Pattern[] = []; // WHERE clause still needs patterns for BGP

    visit(ast, {
      OperationDefinition: (node: OperationDefinitionNode) => {
        if (node.operation !== 'mutation') {
          throw new Error('Only mutation operations are supported.');
        }
      },
      Field: (node: FieldNode) => {
        // This assumes the first field in the mutation defines the operation.
        if (!operationType) {
          const mutationName = node.name.value;
          if (mutationName.startsWith('create')) {
            operationType = 'create';
            entityTypeName = mutationName.substring('create'.length);
          } else if (mutationName.startsWith('update')) {
            operationType = 'update';
            entityTypeName = mutationName.substring('update'.length);
          } else if (mutationName.startsWith('delete')) {
            operationType = 'delete';
            entityTypeName = mutationName.substring('delete'.length);
          } else {
            throw new Error(
              `Unsupported mutation operation: ${mutationName}. Must start with create, update, or delete.`
            );
          }

          // For update/delete, expect an 'id' argument for the subject.
          if (operationType === 'update' || operationType === 'delete') {
            const idArg = node.arguments?.find(arg => arg.name.value === 'id');
            if (!idArg || idArg.value.kind !== Kind.STRING) {
              throw new Error(
                `${operationType} mutations require an 'id' argument of type String.`
              );
            }
            const iriValue = (idArg.value as StringValueNode).value;
            // Basic IRI validation to prevent injection
            if (
              iriValue.includes('\n') ||
              iriValue.includes('\r') ||
              iriValue.includes('>') ||
              iriValue.includes('<')
            ) {
              throw new Error(
                'Invalid IRI: contains illegal characters that could cause injection'
              );
            }
            // Expand the IRI using the context
            const expandedIri = this.expandIri(iriValue);
            subjectHint = this.dataFactory.namedNode(expandedIri);
          }
        }

        // Process arguments based on operation type
        if (operationType === 'create') {
          this.handleCreate(node, entityTypeName!, createQuads);
          // In 'create', subjectHint might be set if 'id' was in input, otherwise it's generated in handleCreate
          // For simplicity, this example assumes handleCreate populates subjectHint if an ID is found in input.
        } else if (operationType === 'update' && subjectHint) {
          this.handleUpdate(
            node,
            subjectHint as RDF.NamedNode,
            entityTypeName!,
            updateInsertQuads,
            updateDeleteQuads,
            updateWherePatterns
          );
        } else if (operationType === 'delete' && subjectHint) {
          this.handleDelete(node, subjectHint as RDF.NamedNode, deleteQuads, deleteWherePatterns);
        }

        // Stop visiting deeper. This is a simplification.
        // A real implementation might need to handle the selection set for return values.
        return false;
      },
    });

    if (operationType === 'create' && createQuads.length > 0) {
      // For INSERT DATA equivalent, we use createDeleteInsert with only insert part
      const insertOperation = this.sparqlAlgebraFactory.createDeleteInsert(
        undefined, // delete (empty for INSERT DATA)
        createQuads.map(quad => this.quadToAlgebraPattern(quad)), // convert quads to patterns
        undefined // where (empty for INSERT DATA)
      );
      operation = this.sparqlAlgebraFactory.createCompositeUpdate([insertOperation]);
    } else if (
      operationType === 'update' &&
      (updateInsertQuads.length > 0 || updateDeleteQuads.length > 0)
    ) {
      // Ensure there's something to do for an update
      if (updateInsertQuads.length === 0 && updateDeleteQuads.length === 0) {
        throw new Error(
          'Update operation resulted in no changes. Input might be empty or invalid.'
        );
      }

      const whereBgp = this.sparqlAlgebraFactory.createBgp(updateWherePatterns);

      const updateOperation = this.sparqlAlgebraFactory.createDeleteInsert(
        updateDeleteQuads.length > 0
          ? updateDeleteQuads.map(quad => this.quadToAlgebraPattern(quad))
          : undefined, // delete quads converted to patterns
        updateInsertQuads.length > 0
          ? updateInsertQuads.map(quad => this.quadToAlgebraPattern(quad))
          : undefined, // insert quads converted to patterns
        whereBgp
      );
      operation = this.sparqlAlgebraFactory.createCompositeUpdate([updateOperation]);
    } else if (operationType === 'delete' && deleteQuads.length > 0) {
      const whereBgp = this.sparqlAlgebraFactory.createBgp(deleteWherePatterns);

      const deleteOperation = this.sparqlAlgebraFactory.createDeleteInsert(
        deleteQuads.map(quad => this.quadToAlgebraPattern(quad)), // delete quads converted to patterns
        undefined, // insert (empty for DELETE)
        whereBgp // where
      );
      operation = this.sparqlAlgebraFactory.createCompositeUpdate([deleteOperation]);
    }

    if (!operation) {
      throw new Error(
        'Failed to convert mutation to SPARQL algebra. Operation type might be unhandled or input was empty.'
      );
    }
    return operation;
  }

  /**
   * Converts a GraphQL mutation string into a SPARQL UPDATE string.
   * This method uses the same proven security approach as query conversion.
   *
   * @param mutationString The GraphQL mutation string to convert.
   * @param variables Optional GraphQL variables to substitute in the mutation.
   * @returns A SPARQL UPDATE string.
   */
  public convertToSparql(mutationString: string, variables?: { [key: string]: unknown }): string {
    // TODO: Implement variable substitution in future versions
    if (variables && Object.keys(variables).length > 0) {
      // Variables parameter is acknowledged but not yet implemented
      throw new Error('Variable substitution is not yet implemented in mutation conversion');
    }
    const algebra = this.convert(mutationString);
    // Use the same proven secure serialization as queries
    return toSparql(algebra);
  }

  /**
   * Handles the conversion of a 'create' mutation field.
   * Populates the `quads` array with RDF.Quads for an INSERT DATA operation.
   * @param node The GraphQL FieldNode representing the create mutation.
   * @param entityName The derived name of the entity to create (e.g., "User" from "createUser").
   * @param quads An array to be populated with the generated RDF.Quads.
   * @private
   */
  private handleCreate(node: FieldNode, entityName: string, quads: RDF.Quad[]): void {
    const inputArg = node.arguments?.find(arg => arg.name.value === 'input');
    if (!inputArg || inputArg.value.kind !== Kind.OBJECT) {
      throw new Error(`Create mutation for ${entityName} must have an 'input' object argument.`);
    }
    const inputObject = inputArg.value as ObjectValueNode;
    const entityTypeIri = this.getTypeIri(entityName);

    let localSubject: RDF.NamedNode | RDF.BlankNode;
    const idField = inputObject.fields.find(field => field.name.value === 'id');
    if (idField) {
      if (idField.value.kind !== Kind.STRING)
        throw new Error("Input 'id' field must be a String for create.");
      const iriValue = (idField.value as StringValueNode).value;
      // Basic IRI validation to prevent injection
      if (
        iriValue.includes('\n') ||
        iriValue.includes('\r') ||
        iriValue.includes('>') ||
        iriValue.includes('<')
      ) {
        throw new Error('Invalid IRI: contains illegal characters that could cause injection');
      }

      // Expand the IRI using the context
      const expandedIri = this.expandIri(iriValue);
      localSubject = this.dataFactory.namedNode(expandedIri);
    } else {
      // Use skolemized IRI instead of blank node for better idempotency
      const uuid = this.generateUUID();
      localSubject = this.dataFactory.namedNode(`urn:uuid:${uuid}`);
    }

    quads.push(
      this.dataFactory.quad(
        localSubject,
        this.dataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        entityTypeIri
      )
    );

    inputObject.fields.forEach(field => {
      const fieldName = field.name.value;
      if (fieldName === 'id') return;

      const predicateIri = this.getPredicateIri(fieldName);

      // Handle relationship fields (like productId -> product or direct relationship fields)
      if (
        (fieldName.endsWith('Id') || this.isRelationshipField(fieldName)) &&
        field.value.kind === Kind.STRING
      ) {
        const relationshipName = fieldName.endsWith('Id') ? fieldName.slice(0, -2) : fieldName;
        const relationshipPredicateIri = this.getPredicateIri(relationshipName);
        const relatedEntityIri = this.expandIri((field.value as StringValueNode).value);
        const relatedEntityNode = this.dataFactory.namedNode(relatedEntityIri);
        quads.push(
          this.dataFactory.quad(localSubject, relationshipPredicateIri, relatedEntityNode)
        );

        // Also create the inverse relationship if it exists in the context
        try {
          const inversePredicateIri = this.getInversePredicateIri(relationshipName);
          if (inversePredicateIri) {
            quads.push(this.dataFactory.quad(relatedEntityNode, inversePredicateIri, localSubject));
          }
        } catch (error) {
          // Inverse relationship not found in context, skip
        }
      } else {
        const objectValue = this.parseValueNode(field.value);
        quads.push(this.dataFactory.quad(localSubject, predicateIri, objectValue));
      }
    });
  }

  /**
   * Expands a relative IRI using the JSON-LD context.
   * @param iri The IRI to expand.
   * @returns The expanded IRI.
   * @private
   */
  private expandIri(iri: string): string {
    // If it's already an absolute IRI, return as is
    if (iri.startsWith('http://') || iri.startsWith('https://')) {
      return iri;
    }

    // Get base from context
    const contextRaw = this.context.getContextRaw();
    const base = contextRaw['@base'] as string;

    // If no base is defined, use the IRI as is
    if (!base) {
      return iri;
    }

    // Remove trailing slash from base if present
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

    // Use the IRI as-is since colons are valid in URL paths
    return `${cleanBase}/${iri}`;
  }

  /**
   * Generates a UUID v4 string for unique resource identification.
   * This is a simple implementation - in production, consider using a proper UUID library.
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Handles the conversion of an 'update' mutation field.
   * Populates insert, delete, and where patterns for a DELETE/INSERT WHERE operation.
   * @param node The GraphQL FieldNode representing the update mutation.
   * @param subject The RDF.NamedNode representing the subject of the update.
   * @param entityName The derived name of the entity being updated.
   * @param insertPatterns Array to populate with insert patterns.
   * @param deletePatterns Array to populate with delete patterns.
   * @param wherePatterns Array to populate with where patterns.
   * @private
   */
  private handleUpdate(
    node: FieldNode,
    subject: RDF.NamedNode,
    entityName: string,
    insertQuads: RDF.Quad[],
    deleteQuads: RDF.Quad[],
    wherePatterns: Algebra.Pattern[]
  ): void {
    const inputArg = node.arguments?.find(arg => arg.name.value === 'input');
    if (!inputArg || inputArg.value.kind !== Kind.OBJECT) {
      throw new Error(`Update mutation for ${entityName} must have an 'input' object argument.`);
    }
    const inputObject = inputArg.value as ObjectValueNode;
    // const entityTypeIri = this.getTypeIri(entityName); // Currently unused

    // Optional: Add type assertion to where clause for safety
    // wherePatterns.push(this.quadToAlgebraPattern(this.dataFactory.quad( // Use new helper
    //   subject,
    //   this.dataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    //   entityTypeIri,
    // )));

    inputObject.fields.forEach(field => {
      const fieldName = field.name.value;
      if (fieldName === 'id')
        throw new Error("'id' field cannot be updated via input object in update mutation.");

      const predicateIri = this.getPredicateIri(fieldName);
      const newObjectValue = this.parseValueNode(field.value);

      const oldObjectVar = this.dataFactory.variable(`old_${fieldName}`);

      // Delete existing value(s) for the predicate
      deleteQuads.push(this.dataFactory.quad(subject, predicateIri, oldObjectVar));
      // Insert new value
      insertQuads.push(this.dataFactory.quad(subject, predicateIri, newObjectValue));
      // Add to WHERE clause to bind the old value
      wherePatterns.push(
        this.quadToAlgebraPattern(
          // Use new helper
          this.dataFactory.quad(subject, predicateIri, oldObjectVar)
        )
      );
    });
    if (insertQuads.length === 0) {
      throw new Error("Update operation has no fields to update in 'input'.");
    }
  }

  /**
   * Handles the conversion of a 'delete' mutation field.
   * Populates delete and where patterns for a DELETE WHERE operation.
   * @param _node The GraphQL FieldNode representing the delete mutation.
   * @param subject The RDF.NamedNode representing the subject to be deleted.
   * @param deletePatterns Array to populate with delete patterns.
   * @param wherePatterns Array to populate with where patterns.
   * @private
   */
  private handleDelete(
    _node: FieldNode,
    subject: RDF.NamedNode,
    deleteQuads: RDF.Quad[],
    wherePatterns: Algebra.Pattern[]
  ): void {
    // For DELETE WHERE { <subj> ?p ?o . }, delete all triples with this subject.
    const pVar = this.dataFactory.variable('p_del');
    const oVar = this.dataFactory.variable('o_del');

    const patternToDelete = this.quadToAlgebraPattern(this.dataFactory.quad(subject, pVar, oVar)); // Use new helper
    deleteQuads.push(this.dataFactory.quad(subject, pVar, oVar));
    wherePatterns.push(patternToDelete); // The same pattern is used in the WHERE clause
  }

  /**
   * Parses a GraphQL ValueNode and converts it to an RDF.Literal.
   * Handles String, Int, Float, and Boolean kinds.
   * String values are passed through as-is since sparqlalgebrajs handles escaping during serialization.
   * @param valueNode The GraphQL ValueNode to parse.
   * @returns An RDF.Literal representation of the value.
   * @throws Error if the value kind is unsupported.
   * @private
   */
  private parseValueNode(valueNode: ValueNode): RDF.Literal {
    switch (valueNode.kind) {
      case Kind.STRING:
        // No manual escaping needed - sparqlalgebrajs toSparql() handles it during serialization
        return this.dataFactory.literal(valueNode.value);
      case Kind.INT:
        return this.dataFactory.literal(
          valueNode.value,
          this.dataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer')
        );
      case Kind.FLOAT:
        // rdf-data-factory literal expects a string for the lexical value.
        return this.dataFactory.literal(
          String(valueNode.value),
          this.dataFactory.namedNode('http://www.w3.org/2001/XMLSchema#double')
        );
      case Kind.BOOLEAN:
        return this.dataFactory.literal(
          String(valueNode.value),
          this.dataFactory.namedNode('http://www.w3.org/2001/XMLSchema#boolean')
        );
      // TODO: Handle LIST, OBJECT (for nested structures or specific literal types via objects)
      default:
        throw new Error(`Unsupported GraphQL value kind: ${valueNode.kind}`);
    }
  }

  /**
   * Retrieves the IRI for a GraphQL field name from the JSON-LD context.
   * @param fieldName The GraphQL field name.
   * @returns An RDF.NamedNode representing the predicate IRI.
   * @throws Error if no mapping is found in the context.
   * @private
   */
  private getPredicateIri(fieldName: string): RDF.NamedNode {
    const term = this.context.getContextRaw()[fieldName];
    if (typeof term === 'string') {
      return this.dataFactory.namedNode(term);
    } else if (
      typeof term === 'object' &&
      term !== null &&
      '@id' in term &&
      typeof term['@id'] === 'string'
    ) {
      return this.dataFactory.namedNode(term['@id']);
    }
    throw new Error(`No IRI mapping found for predicate: ${fieldName} in the JSON-LD context.`);
  }

  /**
   * Retrieves the IRI for a GraphQL type name (entity name) from the JSON-LD context.
   * It first attempts an exact match, then a capitalized version, then checks the @vocab term.
   * @param typeName The GraphQL type name (e.g., "User").
   * @returns An RDF.NamedNode representing the type IRI.
   * @throws Error if no mapping is found in the context.
   * @private
   */
  private getTypeIri(typeName: string): RDF.NamedNode {
    // Attempt to find by exact match or common conventions (e.g., capitalize)
    let term = this.context.getContextRaw()[typeName];
    if (!term) {
      const capitalizedTypeName = typeName.charAt(0).toUpperCase() + typeName.slice(1);
      term = this.context.getContextRaw()[capitalizedTypeName];
    }

    if (typeof term === 'string') {
      return this.dataFactory.namedNode(term);
    } else if (
      typeof term === 'object' &&
      term !== null &&
      '@id' in term &&
      typeof term['@id'] === 'string'
    ) {
      return this.dataFactory.namedNode(term['@id']);
    }
    // If not found, try @vocab
    const vocab = this.context.getContextRaw()['@vocab'];
    if (typeof vocab === 'string') {
      return this.dataFactory.namedNode(vocab + typeName);
    }
    throw new Error(`No IRI mapping found for type: ${typeName} in the JSON-LD context.`);
  }

  /**
   * Converts an RDF.Quad to an Algebra.Pattern.
   * @param quad The RDF.Quad to convert.
   * @returns An Algebra.Pattern.
   * @private
   */
  private quadToAlgebraPattern(quad: RDF.Quad): Algebra.Pattern {
    // The factory's createPattern method should handle term conversion if necessary.
    return this.sparqlAlgebraFactory.createPattern(
      quad.subject,
      quad.predicate,
      quad.object,
      quad.graph
    );
  }

  /**
   * Attempts to find the inverse predicate IRI for a relationship.
   * For example, if we have 'product' -> 'schema:itemReviewed',
   * we look for 'reviews' -> 'schema:review' as the inverse.
   * @param relationshipName The name of the relationship.
   * @returns The inverse predicate IRI or null if not found.
   * @private
   */
  private getInversePredicateIri(relationshipName: string): RDF.NamedNode | null {
    // Common inverse relationship patterns
    const inversePatterns: Record<string, string> = {
      product: 'reviews',
      review: 'product',
      user: 'posts',
      post: 'user',
      author: 'works',
      work: 'author',
    };

    const inverseName = inversePatterns[relationshipName];
    if (inverseName) {
      try {
        return this.getPredicateIri(inverseName);
      } catch (error) {
        // Inverse not found in context
        return null;
      }
    }

    return null;
  }

  /**
   * Checks if a field name represents a relationship field.
   * This is used to identify fields that should be treated as object references
   * rather than literal values.
   * @param fieldName The field name to check.
   * @returns True if the field represents a relationship.
   * @private
   */
  private isRelationshipField(fieldName: string): boolean {
    // Check if the field name maps to a relationship predicate in the context
    try {
      const contextTerm = this.context.getContextRaw()[fieldName];

      // If the context term has @type: @id, it's a relationship
      if (
        typeof contextTerm === 'object' &&
        contextTerm !== null &&
        contextTerm['@type'] === '@id'
      ) {
        return true;
      }

      // Check common relationship field names
      const relationshipFields = [
        'product',
        'review',
        'user',
        'author',
        'owner',
        'creator',
        'parent',
        'child',
      ];
      return relationshipFields.includes(fieldName.toLowerCase());
    } catch (error) {
      // If we can't resolve the predicate, assume it's not a relationship
      return false;
    }
  }
}
