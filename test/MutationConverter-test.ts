import { MutationConverter } from '../src/mutation/MutationConverter';
import { JsonLdContextNormalized } from 'jsonld-context-parser/lib/JsonLdContextNormalized';
import { ContextParser } from 'jsonld-context-parser';
import { DataFactory } from 'rdf-data-factory';
import * as RDF from '@rdfjs/types';
import { Algebra, Factory } from 'sparqlalgebrajs'; // Import Factory directly, no alias

const DF = new DataFactory(); // Global data factory for tests

describe('MutationConverter', () => {
  let context: JsonLdContextNormalized;
  let converter: MutationConverter;

  beforeEach(async () => {
    const rawContext = {
      '@context': {
        '@base': 'http://example.org/',
        ex: 'http://example.org/',
        foaf: 'http://xmlns.com/foaf/0.1/',
        dct: 'http://purl.org/dc/terms/',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        id: '@id',
        type: '@type',
        User: 'ex:User',
        Person: 'ex:Person',
        Task: 'ex:Task',
        Product: 'ex:Product',
        name: 'foaf:name',
        age: { '@id': 'ex:age', '@type': 'xsd:integer' },
        title: 'dct:title',
        price: { '@id': 'ex:price', '@type': 'xsd:double' },
        inStock: { '@id': 'ex:inStock', '@type': 'xsd:boolean' },
        description: 'ex:description',
        unknownField: 'ex:unknownField',
        friend: { '@id': 'foaf:knows', '@type': '@id' },
        createUser: 'ex:createUser',
        updateUser: 'ex:updateUser',
        deleteUser: 'ex:deleteUser',
        createTask: 'ex:createTask',
        createProduct: 'ex:createProduct',
      },
    };
    context = await new ContextParser().parse(rawContext);
    converter = new MutationConverter(context, DF);
  });

  // Helper to create an RDF.Quad from strings, assumes DF is in scope
  // const quad = (s: RDF.Term, p: RDF.Term, o: RDF.Term, g?: RDF.Term): RDF.Quad =>
  //   DF.quad(s as any, p as any, o as any, g as any || DF.defaultGraph());

  // Helper to create Algebra.Pattern from strings
  const localSparqlAlgebraFactory = new Factory(DF); // Use Factory directly

  const pattern = (s: RDF.Term, p: RDF.Term, o: RDF.Term, g?: RDF.Term): Algebra.Pattern =>
    localSparqlAlgebraFactory.createPattern(s, p, o, g || DF.defaultGraph());

  // Helper to check if a pattern exists in a patterns array (comparing by quad properties)
  const containsPattern = (patterns: any[], expected: Algebra.Pattern): boolean => {
    return patterns.some(
      p =>
        p.subject &&
        p.predicate &&
        p.object &&
        p.graph &&
        p.subject.equals(expected.subject) &&
        p.predicate.equals(expected.predicate) &&
        p.object.equals(expected.object) &&
        p.graph.equals(expected.graph)
    );
  };

  describe('Create Mutations', () => {
    it('should convert a simple create mutation with client-provided ID', () => {
      const mutationString = `
        mutation {
          createUser(input: {id: "ex:user1", name: "Alice", age: 30}) {
            id
          }
        }
      `;
      const result = converter.convert(mutationString);
      const updateOp = result.updates[0] as any;

      expect(result.type).toBe('compositeupdate');
      expect(result.updates.length).toBe(1);
      expect(updateOp.type).toBe('deleteinsert');
      expect(updateOp.insert).toBeDefined();
      expect(Array.isArray(updateOp.insert)).toBe(true);
      expect(updateOp.insert.length).toBe(3);

      const expectedSubject = DF.namedNode('http://example.org/ex:user1');
      const typePredicate = DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      const userType = DF.namedNode('http://example.org/User');
      const namePredicate = DF.namedNode('http://xmlns.com/foaf/0.1/name');
      const agePredicate = DF.namedNode('http://example.org/age');

      const patterns = updateOp.insert;
      expect(containsPattern(patterns, pattern(expectedSubject, typePredicate, userType))).toBe(
        true
      );
      expect(
        containsPattern(patterns, pattern(expectedSubject, namePredicate, DF.literal('Alice')))
      ).toBe(true);
      expect(
        containsPattern(
          patterns,
          pattern(
            expectedSubject,
            agePredicate,
            DF.literal('30', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
          )
        )
      ).toBe(true);
    });

    it('should convert a create mutation with auto-generated ID (blank node)', () => {
      const mutationString = `
        mutation {
          createTask(input: {title: "New Task"}) {
            id
          }
        }
      `;
      const result = converter.convert(mutationString);
      const updateOp = result.updates[0] as any;
      expect(updateOp.type).toBe('deleteinsert');
      expect(Array.isArray(updateOp.insert)).toBe(true);
      expect(updateOp.insert.length).toBe(2);

      const subject = updateOp.insert[0].subject;
      expect(subject.termType).toBe('NamedNode');

      const typePredicate = DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      const taskType = DF.namedNode('http://example.org/Task');
      const titlePredicate = DF.namedNode('http://purl.org/dc/terms/title');

      const patterns = updateOp.insert;
      expect(containsPattern(patterns, pattern(subject, typePredicate, taskType))).toBe(true);
      expect(
        containsPattern(patterns, pattern(subject, titlePredicate, DF.literal('New Task')))
      ).toBe(true);
    });

    it('should convert a create mutation with various data types', () => {
      const mutationString = `
        mutation {
          createProduct(input: {name: "Laptop", price: 1200.50, inStock: true}) {
            id
          }
        }
      `;
      const result = converter.convert(mutationString);
      const updateOp = result.updates[0] as any;
      expect(updateOp.type).toBe('deleteinsert');
      expect(Array.isArray(updateOp.insert)).toBe(true);
      expect(updateOp.insert.length).toBe(4); // type, name, price, inStock

      const subject = updateOp.insert[0].subject;
      expect(subject.termType).toBe('NamedNode');

      const productType = DF.namedNode('http://example.org/Product');
      const namePredicate = DF.namedNode('http://xmlns.com/foaf/0.1/name');
      const pricePredicate = DF.namedNode('http://example.org/price');
      const inStockPredicate = DF.namedNode('http://example.org/inStock');

      const patterns = updateOp.insert;
      expect(
        containsPattern(
          patterns,
          pattern(
            subject,
            DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            productType
          )
        )
      ).toBe(true);
      expect(containsPattern(patterns, pattern(subject, namePredicate, DF.literal('Laptop')))).toBe(
        true
      );
      expect(
        containsPattern(
          patterns,
          pattern(
            subject,
            pricePredicate,
            DF.literal('1200.50', DF.namedNode('http://www.w3.org/2001/XMLSchema#double'))
          )
        )
      ).toBe(true);
      expect(
        containsPattern(
          patterns,
          pattern(
            subject,
            inStockPredicate,
            DF.literal('true', DF.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))
          )
        )
      ).toBe(true);
    });
  });

  // Placeholder for Update, Delete, and Error test suites
  describe('Update Mutations', () => {
    it('should convert a simple update of one field', () => {
      const mutationString = `
        mutation {
          updateUser(id: "ex:user1", input: {name: "Alice B."}) {
            id
          }
        }
      `;
      const result = converter.convert(mutationString);
      expect(result.type).toBe('compositeupdate');
      const op = result.updates[0] as any;
      expect(op.type).toBe('deleteinsert');

      const subject = DF.namedNode('http://example.org/ex:user1');
      const namePredicate = DF.namedNode('http://xmlns.com/foaf/0.1/name');
      const oldNameVar = DF.variable('old_name');

      expect(op.delete).toBeDefined();
      expect(Array.isArray(op.delete)).toBe(true);
      expect(op.delete.length).toBe(1);
      expect(containsPattern(op.delete, pattern(subject, namePredicate, oldNameVar))).toBe(true);

      expect(op.insert).toBeDefined();
      expect(Array.isArray(op.insert)).toBe(true);
      expect(op.insert.length).toBe(1);
      expect(
        containsPattern(op.insert, pattern(subject, namePredicate, DF.literal('Alice B.')))
      ).toBe(true);

      expect(op.where).toBeDefined();
      // For where, check for patterns property and check patterns accordingly
      if (op.where && op.where.patterns) {
        expect(op.where.patterns.length).toBe(1);
        expect(
          containsPattern(op.where.patterns, pattern(subject, namePredicate, oldNameVar))
        ).toBe(true);
      }
    });

    it('should convert an update of multiple fields', () => {
      const mutationString = `
          mutation {
            updateUser(id: "ex:user1", input: {name: "Alicia", age: 31}) {
              id
            }
          }
        `;
      const result = converter.convert(mutationString);
      const op = result.updates[0] as any;
      expect(op.type).toBe('deleteinsert');

      const subject = DF.namedNode('http://example.org/ex:user1');
      const namePredicate = DF.namedNode('http://xmlns.com/foaf/0.1/name');
      const agePredicate = DF.namedNode('http://example.org/age');
      const oldNameVar = DF.variable('old_name');
      const oldAgeVar = DF.variable('old_age');

      expect(op.delete).toBeDefined();
      expect(Array.isArray(op.delete)).toBe(true);
      expect(op.delete.length).toBe(2);
      expect(containsPattern(op.delete, pattern(subject, namePredicate, oldNameVar))).toBe(true);
      expect(containsPattern(op.delete, pattern(subject, agePredicate, oldAgeVar))).toBe(true);

      expect(op.insert).toBeDefined();
      expect(Array.isArray(op.insert)).toBe(true);
      expect(op.insert.length).toBe(2);
      expect(
        containsPattern(op.insert, pattern(subject, namePredicate, DF.literal('Alicia')))
      ).toBe(true);
      expect(
        containsPattern(
          op.insert,
          pattern(
            subject,
            agePredicate,
            DF.literal('31', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
          )
        )
      ).toBe(true);

      expect(op.where).toBeDefined();
      // For where, check for patterns property and check patterns accordingly
      if (op.where && op.where.patterns) {
        expect(op.where.patterns.length).toBe(2);
        expect(
          containsPattern(op.where.patterns, pattern(subject, namePredicate, oldNameVar))
        ).toBe(true);
        expect(containsPattern(op.where.patterns, pattern(subject, agePredicate, oldAgeVar))).toBe(
          true
        );
      }
    });

    it('should throw error for update mutation with missing id', () => {
      const mutationString = `mutation { updateUser(input: {name: "Noone"}) { id } }`;
      expect(() => converter.convert(mutationString)).toThrow(
        /update mutations require an 'id' argument/
      );
    });
  });

  describe('Delete Mutations', () => {
    it('should convert a simple delete mutation', () => {
      const mutationString = `mutation { deleteUser(id: "ex:user1") { success } }`;
      const result = converter.convert(mutationString);
      const op = result.updates[0] as any;
      expect(op.type).toBe('deleteinsert');

      const subject = DF.namedNode('http://example.org/ex:user1');
      const pVar = DF.variable('p_del');
      const oVar = DF.variable('o_del');
      const expectedPattern = pattern(subject, pVar, oVar);

      expect(op.delete).toBeDefined();
      expect(Array.isArray(op.delete)).toBe(true);
      expect(op.delete.length).toBe(1);
      expect(containsPattern(op.delete, expectedPattern)).toBe(true);

      expect(op.insert).toBeUndefined(); // No insert clause for delete

      expect(op.where).toBeDefined();
      // For where, check for patterns property and check patterns accordingly
      if (op.where && op.where.patterns) {
        expect(op.where.patterns.length).toBe(1);
        expect(containsPattern(op.where.patterns, expectedPattern)).toBe(true);
      }
    });

    it('should throw error for delete mutation with missing id', () => {
      const mutationString = `mutation { deleteUser { success } }`;
      expect(() => converter.convert(mutationString)).toThrow(
        /delete mutations require an 'id' argument/
      );
    });
  });

  describe('Error Handling & Context', () => {
    it('should throw error if a field name in input is not in context', () => {
      const mutationString = `mutation { createUser(input: {nonExistentField: "data"}) { id } }`;
      // Note: 'nonExistentField' is not in the global context mapping.
      // The current getPredicateIri throws if not found.
      expect(() => converter.convert(mutationString)).toThrow(
        'No IRI mapping found for predicate: nonExistentField in the JSON-LD context.'
      );
    });

    it('should throw error if an entity type from mutation name is not in context', () => {
      const mutationString = `mutation { createNonExistentType(input: {name: "test"}) { id } }`;
      // 'NonExistentType' is not in the context.
      // The current getTypeIri throws if not found after trying vocab.
      expect(() => converter.convert(mutationString)).toThrow(
        'No IRI mapping found for type: NonExistentType in the JSON-LD context.'
      );
    });

    it('should throw error for unsupported mutation operation (not create/update/delete)', () => {
      const mutationString = `mutation { queryUser(id: "ex:user1") { name } }`;
      expect(() => converter.convert(mutationString)).toThrow(
        'Unsupported mutation operation: queryUser. Must start with create, update, or delete.'
      );
    });

    it('should create a user with empty input (only type quad)', () => {
      const mutationString = `mutation { createUser(input: {}) { id } }`;
      // This creates only a type quad. Should still produce a valid deleteinsert operation.
      const result = converter.convert(mutationString);
      const updateOp = result.updates[0] as any; // Use any or check structure
      expect(updateOp.type).toBe('deleteinsert');
      expect(updateOp.insert).toBeDefined();
      expect(Array.isArray(updateOp.insert)).toBe(true);
      expect(updateOp.insert.length).toBe(1); // Just the type quad

      const subject = updateOp.insert[0].subject;
      expect(subject.termType).toBe('NamedNode');
      expect(updateOp.insert[0].predicate.value).toBe(
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
      );
      expect(updateOp.insert[0].object.value).toBe('http://example.org/User');
    });

    it('should throw error for update mutation with empty input', () => {
      const mutationString = `mutation { updateUser(id: "ex:user1", input: {}) { id } }`;
      expect(() => converter.convert(mutationString)).toThrow(
        "Update operation has no fields to update in 'input'."
      );
    });

    it('should throw error when trying to update id field', () => {
      const mutationString = `mutation { updateUser(id: "ex:user1", input: {id: "new-id", name: "New Name"}) { id } }`;
      expect(() => converter.convert(mutationString)).toThrow(
        "'id' field cannot be updated via input object in update mutation."
      );
    });

    it('should throw error for variables in convertToSparql', () => {
      const mutationString = `mutation { createUser(input: {name: "Alice"}) { id } }`;
      const variables = { name: 'Alice' };
      expect(() => converter.convertToSparql(mutationString, variables)).toThrow(
        'Variable substitution is not yet implemented in mutation conversion'
      );
    });

    it('should handle expandIri when no @base is defined in context', async () => {
      // Create a context without @base - but the current implementation requires @base
      // This test demonstrates that the code expects @base to be present
      const contextWithoutBase = await new ContextParser().parse({
        '@context': {
          ex: 'http://example.org/',
          Person: 'ex:Person',
          name: 'ex:name',
          // No @base defined
        },
      });

      const converterWithoutBase = new MutationConverter(contextWithoutBase, DF);

      const mutationString = `
        mutation {
          createPerson(input: {id: "relative-id", name: "Test"}) {
            id
          }
        }
      `;

      // This should throw because @base is undefined but the code expects a string
      expect(() => converterWithoutBase.convert(mutationString)).toThrow(
        'Invalid @base in context: expected string, got undefined'
      );
    });

    it('should throw error for unsupported GraphQL value kind', () => {
      // We need to test this by mocking a field with an unsupported value kind
      // Since we can't easily create a VARIABLE or ENUM kind in normal GraphQL,
      // we'll test this by patching the parseValueNode method
      const originalParseValueNode = (converter as any).parseValueNode;

      try {
        // Override parseValueNode to call the original with a mocked unsupported value
        (converter as any).parseValueNode = jest.fn().mockImplementation(valueNode => {
          if (valueNode.kind === 'VARIABLE') {
            return originalParseValueNode.call(converter, valueNode);
          }
          return originalParseValueNode.call(converter, valueNode);
        });

        // Create a mutation and manually test the parseValueNode with unsupported kind
        const unsupportedValueNode = { kind: 'VARIABLE', name: { value: 'test' } } as any;

        expect(() => {
          (converter as any).parseValueNode(unsupportedValueNode);
        }).toThrow('Unsupported GraphQL value kind: VARIABLE');
      } finally {
        // Restore the original method
        (converter as any).parseValueNode = originalParseValueNode;
      }
    });

    it('should use @vocab fallback when specific type mapping not found', async () => {
      // Create a context with @vocab but without specific type mapping
      const vocabContext = await new ContextParser().parse({
        '@context': {
          '@base': 'http://example.org/',
          '@vocab': 'http://vocab.example.org/',
          name: 'ex:name',
        },
      });

      const vocabConverter = new MutationConverter(vocabContext, DF);

      const mutation = `
        mutation {
          createCustomType(input: { name: "test" }) {
            name
          }
        }
      `;

      // This should not throw - should use @vocab fallback
      const result = vocabConverter.convert(mutation);
      expect(result.type).toBe('compositeupdate');

      const updateOp = result.updates[0] as any;
      expect(updateOp.insert).toBeDefined();

      // Should have used vocab + type name
      const typeQuad = updateOp.insert.find(
        (quad: any) => quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
      );
      expect(typeQuad.object.value).toBe('http://vocab.example.org/CustomType');
    });
  });
});
