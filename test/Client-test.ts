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
});
