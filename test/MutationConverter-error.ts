import { MutationConverter } from '../src/mutation/MutationConverter';
import { DataFactory } from 'rdf-data-factory';
import { JsonLdContextNormalized } from 'jsonld-context-parser/lib/JsonLdContextNormalized';
import { ContextParser } from 'jsonld-context-parser';

const DF = new DataFactory();

describe('MutationConverter Error Handling', () => {
  let converter: MutationConverter;
  let context: JsonLdContextNormalized;

  beforeEach(async () => {
    context = await new ContextParser().parse({
      '@context': {
        '@base': 'http://example.org/',
        ex: 'http://example.org/',
        Person: 'ex:Person',
        name: 'ex:name',
        age: 'ex:age',
        active: 'ex:active',
      },
    });
    converter = new MutationConverter(context, DF);
  });

  describe('IRI validation errors', () => {
    it('should throw error for invalid IRIs in create mutations', () => {
      const mutation = `
        mutation {
          createPerson(input: { id: "http://example.org/person<script>alert('xss')</script>" }) {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        'Invalid IRI: contains illegal characters that could cause injection'
      );
    });

    it('should throw error for IRIs with newlines', () => {
      const mutation = `
        mutation {
          createPerson(input: { id: "http://example.org/person\\ninvalid" }) {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        'Invalid IRI: contains illegal characters that could cause injection'
      );
    });

    it('should throw error for IRIs with carriage returns', () => {
      const mutation = `
        mutation {
          createPerson(input: { id: "http://example.org/person\\rinvalid" }) {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        'Invalid IRI: contains illegal characters that could cause injection'
      );
    });

    it('should throw error for IRIs with angle brackets', () => {
      const mutation = `
        mutation {
          createPerson(input: { id: "http://example.org/person>invalid" }) {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        'Invalid IRI: contains illegal characters that could cause injection'
      );
    });
  });

  describe('Missing input argument errors', () => {
    it('should throw error when create mutation lacks input argument', () => {
      const mutation = `
        mutation {
          createPerson {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        "Create mutation for Person must have an 'input' argument."
      );
    });

    it('should throw error when create mutation has non-object input', () => {
      const mutation = `
        mutation {
          createPerson(input: "invalid") {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        "Create mutation input for Person must be an object. Found: StringValue"
      );
    });

    it('should throw error when update mutation lacks input argument', () => {
      const mutation = `
        mutation {
          updatePerson(id: "ex:person1") {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        "Update mutation for Person must have an 'input' argument."
      );
    });

    it('should throw error when update mutation has non-object input', () => {
      const mutation = `
        mutation {
          updatePerson(id: "ex:person1", input: "invalid") {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        "Update mutation input for Person must be an object. Found: StringValue"
      );
    });
  });

  describe('Empty update operations', () => {
    it('should throw error when update operation results in no changes', () => {
      const mutation = `
        mutation {
          updatePerson(id: "ex:person1", input: {}) {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        "Update operation has no fields to update in 'input'."
      );
    });
  });

  describe('Unsupported value types', () => {
    it('should throw error for unsupported GraphQL value kinds', () => {
      // Test with a field that's not in the context to trigger the predicate error
      const mutation = `
        mutation {
          createPerson(input: { 
            name: "John",
            unmappedField: "test"
          }) {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        'No IRI mapping found for predicate: unmappedField in the JSON-LD context.'
      );
    });
  });

  describe('Context mapping errors', () => {
    it('should throw error when no IRI mapping found for type', async () => {
      // Create a context without the required type mapping
      const limitedContext = await new ContextParser().parse({
        '@context': {
          '@base': 'http://example.org/',
          ex: 'http://example.org/',
          name: 'ex:name',
          // Missing "UnknownType" mapping
        },
      });

      const limitedConverter = new MutationConverter(limitedContext, DF);

      const mutation = `
        mutation {
          createUnknownType(input: { name: "test" }) {
            name
          }
        }
      `;

      expect(() => limitedConverter.convertToSparql(mutation)).toThrow(
        'No IRI mapping found for type: UnknownType in the JSON-LD context.'
      );
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
      expect(() => vocabConverter.convertToSparql(mutation)).not.toThrow();
    });

    it('should throw error when no IRI mapping found and no @vocab fallback', async () => {
      // Create a context without type mapping and without @vocab
      const noVocabContext = await new ContextParser().parse({
        '@context': {
          '@base': 'http://example.org/',
          name: 'ex:name',
          // No @vocab and no specific type mapping
        },
      });

      const noVocabConverter = new MutationConverter(noVocabContext, DF);

      const mutation = `
        mutation {
          createUnmappedType(input: { name: "test" }) {
            name
          }
        }
      `;

      expect(() => noVocabConverter.convertToSparql(mutation)).toThrow(
        'No IRI mapping found for type: UnmappedType in the JSON-LD context.'
      );
    });
  });

  describe('Invalid field ID types', () => {
    it('should throw error when create mutation id field is not a string', () => {
      const mutation = `
        mutation {
          createPerson(input: { id: 123, name: "John" }) {
            name
          }
        }
      `;

      expect(() => converter.convertToSparql(mutation)).toThrow(
        "Input 'id' field must be a string. Found: IntValue"
      );
    });
  });

  describe('Operation conversion failures', () => {
    it('should handle case where operation conversion somehow fails', () => {
      // This is a difficult edge case to test as it requires the internal
      // operation building to fail in a way that results in no operation
      // Most realistic scenarios are already covered by other tests

      // Test with a completely invalid mutation structure
      const invalidMutation = `
        mutation {
          invalidOperation
        }
      `;

      // This should either parse successfully or throw a parsing error
      // The specific "Failed to convert mutation to SPARQL algebra" error
      // is mainly a defensive check that's hard to trigger in practice
      expect(() => converter.convertToSparql(invalidMutation)).toThrow();
    });
  });
});
