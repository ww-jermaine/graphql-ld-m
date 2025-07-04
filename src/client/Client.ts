import { Converter as GraphQlToSparqlConverter } from "graphql-to-sparql";
import { ExecutionResult } from "graphql/execution/execute";
import { print, ValueNode, Kind, ObjectFieldNode, NameNode } from "graphql/language";
import { GraphQLError } from "graphql/error";
import { ContextParser, JsonLdContextNormalized } from "jsonld-context-parser";
import { DataFactory } from "rdf-data-factory";
import { Converter as SparqlJsonToTreeConverter } from "sparqljson-to-tree";
import { 
  QueryEngine, 
  ClientArgs, 
  QueryArgs, 
  QueryArgsRaw,
  GraphQlToSparqlResult,
  QueryEngineError,
  ExtendedDataFactory
} from '../types/interfaces';
import { MutationConverter } from "../mutation/MutationConverter";

/**
 * A GraphQL-LD client.
 *
 */
export class Client {
  private readonly context: Promise<JsonLdContextNormalized>;
  private readonly queryEngine: QueryEngine;
  private readonly graphqlToSparqlConverter: GraphQlToSparqlConverter;
  private readonly sparqlJsonToTreeConverter: SparqlJsonToTreeConverter;
  private readonly dataFactory: ExtendedDataFactory;

  constructor(args: ClientArgs) {
    const parseOptions = args.baseIRI ? { baseIRI: args.baseIRI } : {};
    this.context = (args.contextParser || new ContextParser()).parse(args.context, parseOptions);
    this.queryEngine = args.queryEngine;
    this.dataFactory = (args.dataFactory || new DataFactory()) as ExtendedDataFactory;

    this.graphqlToSparqlConverter = args.graphqlToSparqlConverter ||
      new GraphQlToSparqlConverter({ dataFactory: this.dataFactory, requireContext: true });
    this.sparqlJsonToTreeConverter = args.sparqlJsonToTreeConverter ||
      new SparqlJsonToTreeConverter({ dataFactory: this.dataFactory, materializeRdfJsTerms: true });
  }

  /**
   * Execute a GraphQL-LD mutation.
   *
   * This method is intended for mutation operations (create, update, delete).
   * It can be invoked in two ways:
   * 1. With a GraphQL mutation string (or parsed `DocumentNode`) in `args.query`:
   *    The mutation string is converted to SPARQL UPDATE algebra using an internal {@link MutationConverter}.
   *    This converter utilizes the JSON-LD context provided to the Client for mapping
   *    GraphQL fields and types to RDF IRIs.
   *    Example: `client.mutate({ query: 'mutation { createUser(input: {...}) { id } }', variables: {...} })`
   *
   * 2. With a pre-converted SPARQL algebra object in `args.sparqlAlgebra`:
   *    This allows providing a custom SPARQL UPDATE algebra operation directly.
   *    Example: `client.mutate({ sparqlAlgebra: myUpdateAlgebra })`
   *
   * @param {QueryArgs} args Query arguments for the mutation
   * @return {Promise<ExecutionResult>} A promise resolving to a GraphQL result
   * @throws {QueryEngineError} If the mutation fails or is not supported
   */
  public async mutate(args: QueryArgs): Promise<ExecutionResult> {
    let sparqlUpdate: string;

    if ('query' in args) {
      const context = await this.context;
      const mutationConverter = new MutationConverter(context, this.dataFactory);
      const queryString = typeof args.query === 'string' ? args.query : print(args.query);
      
      if (args.variables && Object.keys(args.variables).length > 0) {
        throw new QueryEngineError(
          'GraphQL variables in mutations are not yet fully supported.',
          'UNSUPPORTED_FEATURE'
        );
      }
      
      sparqlUpdate = mutationConverter.convertToSparql(queryString, args.variables);
    } else {
      throw new QueryEngineError(
        'Only GraphQL mutation string input is supported for mutations in this client.',
        'INVALID_INPUT'
      );
    }

    if (!this.queryEngine.update) {
      throw new QueryEngineError(
        'Mutations are not supported by the current query engine.',
        'UNSUPPORTED_OPERATION'
      );
    }

    try {
      const sparqlJsonResult = await this.queryEngine.update(sparqlUpdate, args.queryEngineOptions);
      return { data: { mutate: { success: true, details: sparqlJsonResult } } };
    } catch (error) {
      if (error instanceof QueryEngineError) {
        throw error;
      }
      return { 
        data: null, 
        errors: [new GraphQLError(
          `Mutation failed: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          undefined,
          undefined,
          undefined,
          error instanceof Error ? error : undefined,
          { code: 'MUTATION_ERROR' }
        )] 
      };
    }
  }

  /**
   * Execute a GraphQL-LD query.
   *
   * There are three ways of invoking this methods:
   * 1. with a GraphQL query string and optional variables:
   *    `client.query({ query: `{...}`, variables: { varName: 123 } })`
   * 2. with a parsed GraphQL query and optional variables:
   *    `client.query({ query: gql`{...}`, variables: { varName: 123 } })`
   * 3. with a SPARQL algebra object and a singularizeVariables object
   *    `client.query({ sparqlAlgebra, singularizeVariables })`
   *    This corresponds to the result of {@link Client#graphQlToSparql}.
   *
   * @param {QueryArgs} args Query arguments
   * @return {Promise<ExecutionResult>} A promise resolving to a GraphQL result
   * @throws {QueryEngineError} If the query fails
   */
  public async query(args: QueryArgs): Promise<ExecutionResult> {
    try {
      // Convert GraphQL to SPARQL
      const { sparqlAlgebra, singularizeVariables } = 'query' in args
        ? await this.graphQlToSparql({ query: args.query, variables: args.variables || {} })
        : args;

      // Execute SPARQL query
      const sparqlJsonResult = await this.queryEngine.query(sparqlAlgebra, args.queryEngineOptions);

      // Convert SPARQL response to GraphQL response
      const data = this.sparqlJsonToTreeConverter.sparqlJsonResultsToTree(sparqlJsonResult, { singularizeVariables });
      return { data };
    } catch (error) {
      if (error instanceof QueryEngineError) {
        throw error;
      }
      throw new QueryEngineError(
        `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'EXECUTION_ERROR'
      );
    }
  }

  /**
   * Convert a GraphQL query to SPARQL algebra and a singularize variables object.
   * @param {QueryArgsRaw} args Raw query arguments
   * @return {Promise<GraphQlToSparqlResult>} Promise resolving to SPARQL algebra and variables
   * @throws {QueryEngineError} If the conversion fails
   */
  public async graphQlToSparql({ query, variables }: QueryArgsRaw): Promise<GraphQlToSparqlResult> {
    try {
      const singularizeVariables = {};
      const variablesDict = variables ? this.convertVariablesToValueNodes(variables) : {};
      const options = {
        singularizeVariables,
        variablesDict,
      };

      const sparqlAlgebra = await this.graphqlToSparqlConverter
        .graphqlToSparqlAlgebra(query, (await this.context).getContextRaw(), options);
      return { sparqlAlgebra, singularizeVariables };
    } catch (error) {
      throw new QueryEngineError(
        `GraphQL to SPARQL conversion failed: ${error instanceof Error ? error.message : String(error)}`,
        'CONVERSION_ERROR'
      );
    }
  }

  /**
   * Convert JavaScript variable values to GraphQL ValueNode objects.
   * This is needed for the graphql-to-sparql converter to properly handle variables.
   * @param variables Object containing variable name-value pairs
   * @returns Object with variable names mapped to ValueNode objects
   */
  private convertVariablesToValueNodes(variables: { [key: string]: unknown }): { [key: string]: ValueNode } {
    const result: { [key: string]: ValueNode } = {};
    
    for (const [name, value] of Object.entries(variables)) {
      result[name] = this.valueToValueNode(value);
    }
    
    return result;
  }

  /**
   * Convert a JavaScript value to a GraphQL ValueNode.
   * @param value The JavaScript value to convert
   * @returns The corresponding GraphQL ValueNode
   */
  private valueToValueNode(value: unknown): ValueNode {
    if (value === null) {
      return { kind: Kind.NULL };
    }
    
    if (typeof value === 'string') {
      return { kind: Kind.STRING, value };
    }
    
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { kind: Kind.INT, value: value.toString() };
      } else {
        return { kind: Kind.FLOAT, value: value.toString() };
      }
    }
    
    if (typeof value === 'boolean') {
      return { kind: Kind.BOOLEAN, value };
    }
    
    if (Array.isArray(value)) {
      return {
        kind: Kind.LIST,
        values: value.map(item => this.valueToValueNode(item))
      };
    }
    
    if (typeof value === 'object' && value !== null) {
      return {
        kind: Kind.OBJECT,
        fields: Object.entries(value).map(([key, val]): ObjectFieldNode => ({
          kind: Kind.OBJECT_FIELD,
          name: { kind: Kind.NAME, value: key } as NameNode,
          value: this.valueToValueNode(val)
        }))
      };
    }
    
    // Fallback for unknown types - convert to string
    return { kind: Kind.STRING, value: String(value) };
  }
}
