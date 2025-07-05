import { Client } from '../src/client/Client';
import { QueryEngine, QueryEngineError } from '../src/types/interfaces';
import { DataFactory } from 'rdf-data-factory';

describe('Client Error Handling', () => {
  const mockContext = {
    '@context': {
      name: 'http://schema.org/name',
      Person: 'http://schema.org/Person',
      // Add a malformed IRI to trigger a real error
      invalid: 'not a valid IRI',
    },
  };

  const mockQueryEngine: QueryEngine = {
    query: jest.fn(),
    update: jest.fn(),
  };

  const dataFactory = new DataFactory();

  let client: Client;

  beforeEach(() => {
    client = new Client({
      context: mockContext,
      queryEngine: mockQueryEngine,
      dataFactory,
    });
    jest.clearAllMocks();
  });

  describe('mutation() error handling', () => {
    test('should handle variables in mutations correctly', async () => {
      const mutation = `
        mutation {
          createPerson(input: { name: "Test" }) {
            id
          }
        }
      `;

      await expect(
        client.mutate({
          query: mutation,
          variables: { name: 'Test' },
        })
      ).rejects.toThrow('GraphQL variables in mutations are not yet fully supported');
    });

    test('should handle query engine update failure', async () => {
      const mutation = `
        mutation {
          createPerson(input: { name: "Test" }) {
            id
          }
        }
      `;

      const error = new Error('Network error');
      (mockQueryEngine.update as jest.Mock).mockRejectedValue(error);

      const result = await client.mutate({ query: mutation });
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Network error');
      expect(result.errors![0].extensions?.code).toBe('MUTATION_ERROR');
    });

    test('should handle QueryEngineError specifically', async () => {
      const mutation = `
        mutation {
          createPerson(input: { name: "Test" }) {
            id
          }
        }
      `;

      const queryEngineError = new QueryEngineError('Engine specific error', 'TEST_ERROR');
      (mockQueryEngine.update as jest.Mock).mockRejectedValue(queryEngineError);

      await expect(client.mutate({ query: mutation })).rejects.toThrow(queryEngineError);
    });
  });

  describe('query() error handling', () => {
    test('should handle SPARQL response conversion errors', async () => {
      const query = '{ person { name } }';
      (mockQueryEngine.query as jest.Mock).mockResolvedValue({
        invalid: 'response format',
      });

      await expect(client.query({ query })).rejects.toThrow('Query execution failed');
    });

    test('should handle GraphQL to SPARQL conversion errors', async () => {
      const invalidQuery = '{ invalid { syntax }';

      await expect(client.query({ query: invalidQuery })).rejects.toThrow(
        'GraphQL to SPARQL conversion failed'
      );
    });
  });

  describe('graphQlToSparql() error handling', () => {
    test('should handle invalid GraphQL syntax', async () => {
      const invalidQuery = '{ invalid { syntax';

      await expect(client.graphQlToSparql({ query: invalidQuery })).rejects.toThrow(
        'GraphQL to SPARQL conversion failed'
      );
    });

    test('should handle context resolution errors', async () => {
      // Use the malformed IRI field to trigger a conversion error
      const query = `
        {
          Person {
            invalid
          }
        }
      `;

      await expect(client.graphQlToSparql({ query })).rejects.toThrow(
        'GraphQL to SPARQL conversion failed'
      );
    });
  });

  describe('variable conversion edge cases', () => {
    test('should handle complex nested variables', async () => {
      const query = '{ person { name } }';
      const complexVariables = {
        input: {
          nested: {
            array: [1, 'test', true, null],
            object: { key: 'value' },
          },
        },
      };

      // This should not throw an error
      await client.graphQlToSparql({
        query,
        variables: complexVariables,
      });
    });

    test('should handle undefined and null values', async () => {
      const query = '{ person { name } }';
      const variables = {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
      };

      // This should not throw an error
      await client.graphQlToSparql({
        query,
        variables,
      });
    });

    test('should handle array with mixed types', async () => {
      const query = '{ person { name } }';
      const variables = {
        mixedArray: [123, 'string', true, null, { nested: 'object' }, [1, 2, 3]],
      };

      // This should not throw an error
      await client.graphQlToSparql({
        query,
        variables,
      });
    });
  });
});
