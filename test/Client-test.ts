import { Client } from '../src/client/Client';
import {
  QueryEngine,
  QueryEngineError,
  SparqlQueryResult,
  SparqlUpdateResult,
} from '../src/types/interfaces';
import { DataFactory } from 'rdf-data-factory';
import { Algebra } from 'sparqlalgebrajs';

const DF = new DataFactory();

class MockQueryEngine implements QueryEngine {
  constructor(
    private mockQueryResult?: SparqlQueryResult,
    private mockUpdateResult?: SparqlUpdateResult,
    private shouldThrowError = false
  ) {}

  async query(_query: Algebra.Operation): Promise<SparqlQueryResult> {
    if (this.shouldThrowError) {
      throw new QueryEngineError('Mock query error', 'MOCK_ERROR');
    }
    return (
      this.mockQueryResult || {
        head: { vars: ['s'] },
        results: { bindings: [] },
      }
    );
  }

  async update(_query: string): Promise<SparqlUpdateResult> {
    if (this.shouldThrowError) {
      throw new QueryEngineError('Mock update error', 'MOCK_ERROR');
    }
    return (
      this.mockUpdateResult || {
        success: true,
        message: 'Mock update successful',
      }
    );
  }
}

describe('Client', () => {
  const mockContext = {
    '@context': {
      ex: 'http://example.org/',
      name: 'ex:name',
      age: 'ex:age',
      User: 'ex:User',
      Person: 'ex:Person',
    },
  };

  describe('query', () => {
    it('should execute a GraphQL query successfully', async () => {
      const mockResult: SparqlQueryResult = {
        head: { vars: ['name'] },
        results: {
          bindings: [
            {
              name: { type: 'literal', value: 'Test User' },
            },
          ],
        },
      };

      const queryEngine = new MockQueryEngine(mockResult);
      const client = new Client({
        context: mockContext,
        queryEngine,
        dataFactory: DF,
      });

      const query = `
        {
          user {
            name
          }
        }
      `;

      const result = await client.query({ query });
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should handle query errors', async () => {
      const queryEngine = new MockQueryEngine(undefined, undefined, true);
      const client = new Client({
        context: mockContext,
        queryEngine,
        dataFactory: DF,
      });

      const query = `
        {
          user {
            name
          }
        }
      `;

      await expect(client.query({ query })).rejects.toThrow(QueryEngineError);
    });

    it('should handle variable conversion', async () => {
      const queryEngine = new MockQueryEngine();
      const client = new Client({
        context: mockContext,
        queryEngine,
        dataFactory: DF,
      });

      const query = `
        query($name: String!) {
          user(name: $name) {
            age
          }
        }
      `;

      const variables = {
        name: 'Test User',
        age: 25,
        active: true,
        tags: ['tag1', 'tag2'],
        details: { key: 'value' },
      };

      const result = await client.query({ query, variables });
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });
  });

  describe('mutate', () => {
    it('should execute a GraphQL mutation successfully', async () => {
      const mockResult: SparqlUpdateResult = {
        success: true,
        message: 'Update successful',
      };

      const queryEngine = new MockQueryEngine(undefined, mockResult);
      const client = new Client({
        context: mockContext,
        queryEngine,
        dataFactory: DF,
      });

      const mutation = `
        mutation {
          createUser(input: { name: "Test User" }) {
            id
          }
        }
      `;

      const result = await client.mutate({ query: mutation });
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
      const mutateResult = result.data?.['mutate'] as { success: boolean };
      expect(mutateResult).toBeDefined();
      expect(mutateResult.success).toBe(true);
    });

    it('should handle mutation errors', async () => {
      const queryEngine = new MockQueryEngine(undefined, undefined, true);
      const client = new Client({
        context: mockContext,
        queryEngine,
        dataFactory: DF,
      });

      const mutation = `
        mutation {
          createUser(input: { name: "Test User" }) {
            id
          }
        }
      `;

      await expect(client.mutate({ query: mutation })).rejects.toThrow(QueryEngineError);
    });

    it('should reject mutations with variables', async () => {
      const queryEngine = new MockQueryEngine();
      const client = new Client({
        context: mockContext,
        queryEngine,
        dataFactory: DF,
      });

      const mutation = `
        mutation($name: String!) {
          createUser(input: { name: $name }) {
            id
          }
        }
      `;

      await expect(
        client.mutate({
          query: mutation,
          variables: { name: 'Test User' },
        })
      ).rejects.toThrow(QueryEngineError);
    });
  });

  describe('Client Initialization', () => {
    test('should use existing variable method if factory already has one', () => {
      const mockFactory = {
        namedNode: jest.fn(),
        blankNode: jest.fn(),
        literal: jest.fn(),
        defaultGraph: jest.fn(),
        quad: jest.fn(),
        variable: jest.fn().mockImplementation((value: string) => ({
          termType: 'Variable',
          value,
          equals: (other: any) => other.termType === 'Variable' && other.value === value,
        })),
      };

      new Client({
        context: mockContext,
        queryEngine: new MockQueryEngine(),
        dataFactory: mockFactory as any,
      });

      // The factory should use the existing variable method
      expect(mockFactory.variable).toBeDefined();
    });

    test('should create extended factory when base factory lacks variable method', () => {
      const mockFactory = {
        namedNode: jest.fn(),
        blankNode: jest.fn(),
        literal: jest.fn(),
        defaultGraph: jest.fn(),
        quad: jest.fn(),
        // No variable method
      };

      new Client({
        context: mockContext,
        queryEngine: new MockQueryEngine(),
        dataFactory: mockFactory as any,
      });

      // The factory should now have a variable method added
      expect((mockFactory as any).variable).toBeDefined();
    });
  });

  describe('Mutation Error Handling', () => {
    test('should throw error when query engine does not support mutations', async () => {
      const queryEngineWithoutUpdate = {
        query: jest.fn(),
        // No update method
      };

      const client = new Client({
        context: mockContext,
        queryEngine: queryEngineWithoutUpdate,
      });

      const mutation = `
        mutation {
          createPerson(input: { name: "Test" }) {
            id
          }
        }
      `;

      await expect(client.mutate({ query: mutation })).rejects.toThrow(
        'Mutations are not supported by the current query engine.'
      );
    });

    test('should re-throw QueryEngineError with mutation prefix', async () => {
      const queryEngineError = new QueryEngineError('Engine specific error', 'TEST_ERROR');
      const queryEngine = new MockQueryEngine(undefined, undefined, true);
      queryEngine.update = jest.fn().mockRejectedValue(queryEngineError);

      const client = new Client({
        context: mockContext,
        queryEngine,
      });

      const mutation = `
        mutation {
          createPerson(input: { name: "Test" }) {
            id
          }
        }
      `;

      await expect(client.mutate({ query: mutation })).rejects.toThrow(
        'Mutation execution failed: Engine specific error'
      );
    });
  });

  describe('SPARQL Algebra Conversion', () => {
    test('should throw error for invalid algebra object (null)', async () => {
      const client = new Client({
        context: mockContext,
        queryEngine: new MockQueryEngine(),
      });

      // Mock the graphqlToSparql converter to return invalid algebra
      (client as any).graphqlToSparqlConverter = {
        graphqlToSparqlAlgebra: jest.fn().mockResolvedValue(null),
      };

      const query = '{ person { name } }';

      await expect(client.graphQlToSparql({ query })).rejects.toThrow(
        'Invalid SPARQL algebra object'
      );
    });

    test('should throw error for algebra object missing type property', async () => {
      const client = new Client({
        context: mockContext,
        queryEngine: new MockQueryEngine(),
      });

      // Mock the graphqlToSparql converter to return algebra without type
      (client as any).graphqlToSparqlConverter = {
        graphqlToSparqlAlgebra: jest.fn().mockResolvedValue({ invalid: 'object' }),
      };

      const query = '{ person { name } }';

      await expect(client.graphQlToSparql({ query })).rejects.toThrow(
        'SPARQL algebra missing required type property'
      );
    });
  });

  describe('Value Conversion Edge Cases', () => {
    test('should handle unknown value types by converting to string', async () => {
      const client = new Client({
        context: mockContext,
        queryEngine: new MockQueryEngine(),
      });

      const unknownValue = Symbol('test');
      const variables = {
        unknownType: unknownValue,
      };

      // This should not throw an error - should convert unknown types to strings
      const result = await client.graphQlToSparql({
        query: '{ person { name } }',
        variables,
      });

      expect(result).toBeDefined();
    });

    test('should handle undefined value by converting to string', async () => {
      const client = new Client({
        context: mockContext,
        queryEngine: new MockQueryEngine(),
      });

      const variables = {
        undefinedValue: undefined,
      };

      // This should not throw an error
      const result = await client.graphQlToSparql({
        query: '{ person { name } }',
        variables,
      });

      expect(result).toBeDefined();
    });

    test('should handle function value by converting to string', async () => {
      const client = new Client({
        context: mockContext,
        queryEngine: new MockQueryEngine(),
      });

      const variables = {
        functionValue: () => 'test',
      };

      // This should not throw an error
      const result = await client.graphQlToSparql({
        query: '{ person { name } }',
        variables,
      });

      expect(result).toBeDefined();
    });
  });
});
