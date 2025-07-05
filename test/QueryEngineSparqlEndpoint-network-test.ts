import { QueryEngineSparqlEndpoint } from '../src/engine/QueryEngineSparqlEndpoint';
import { QueryEngineError } from '../src/types/interfaces';
import { Factory } from 'sparqlalgebrajs';
import { DataFactory } from 'rdf-data-factory';
import { Algebra } from 'sparqlalgebrajs';

describe('QueryEngineSparqlEndpoint Network Handling', () => {
  const endpointUrl = 'http://example.org/sparql';
  const dataFactory = new DataFactory();
  const algebraFactory = new Factory(dataFactory);
  
  let queryEngine: QueryEngineSparqlEndpoint;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    queryEngine = new QueryEngineSparqlEndpoint(endpointUrl);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to create a valid SPARQL algebra query
  function createTestQuery(): Algebra.Project {
    const subject = dataFactory.namedNode('http://example.org/s');
    const predicate = dataFactory.namedNode('http://example.org/p');
    const object = dataFactory.variable('o');

    const pattern = algebraFactory.createPattern(subject, predicate, object);
    const bgp = algebraFactory.createBgp([pattern]);
    
    // Wrap in Project to make it a valid query
    return algebraFactory.createProject(
      bgp,
      [object]
    );
  }

  describe('Network Error Handling', () => {
    test('should handle network timeout', async () => {
      const query = createTestQuery();
      fetchMock.mockImplementation(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), 100);
      }));

      await expect(queryEngine.query(query))
        .rejects.toThrow(QueryEngineError);
    });

    test('should handle network connection error', async () => {
      const query = createTestQuery();
      fetchMock.mockRejectedValue(new Error('Failed to connect'));

      await expect(queryEngine.query(query))
        .rejects.toThrow(QueryEngineError);
    });

    test('should handle non-200 response status', async () => {
      const query = createTestQuery();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      });

      await expect(queryEngine.query(query))
        .rejects.toThrow(QueryEngineError);
    });

    test('should handle malformed JSON response', async () => {
      const query = createTestQuery();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('Invalid JSON'),
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      await expect(queryEngine.query(query))
        .rejects.toThrow(QueryEngineError);
    });
  });

  describe('Update Operation Network Handling', () => {
    test('should handle update operation timeout', async () => {
      const updateQuery = 'INSERT DATA { <s> <p> <o> }';
      fetchMock.mockImplementation(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), 100);
      }));

      await expect(queryEngine.update(updateQuery))
        .rejects.toThrow(QueryEngineError);
    });

    test('should handle update operation failure response', async () => {
      const updateQuery = 'INSERT DATA { <s> <p> <o> }';
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid update syntax')
      });

      await expect(queryEngine.update(updateQuery))
        .rejects.toThrow(QueryEngineError);
    });
  });

  describe('Response Validation', () => {
    test('should handle missing required fields in response', async () => {
      const query = createTestQuery();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          // Missing 'head' and 'results' fields
          incomplete: 'response'
        })
      });

      await expect(queryEngine.query(query))
        .rejects.toThrow(QueryEngineError);
    });

    test('should handle invalid bindings format', async () => {
      const query = createTestQuery();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          head: { vars: ['o'] },
          results: {
            // Completely invalid format - not even an array
            bindings: "not an array of bindings"
          }
        })
      });

      await expect(queryEngine.query(query))
        .rejects.toThrow(QueryEngineError);
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should handle multiple concurrent requests', async () => {
      const query = createTestQuery();
      const successResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          head: { vars: ['o'] },
          results: { bindings: [] }
        })
      };

      fetchMock.mockResolvedValue(successResponse);

      // Make multiple concurrent requests
      const requests = Array(5).fill(null).map(() => queryEngine.query(query));
      
      await expect(Promise.all(requests)).resolves.toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    test('should handle mixed success/failure concurrent requests', async () => {
      const query = createTestQuery();
      let callCount = 0;

      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            head: { vars: ['o'] },
            results: { bindings: [] }
          })
        });
      });

      const requests = Array(4).fill(null).map(() => queryEngine.query(query));
      
      const results = await Promise.allSettled(requests);
      expect(results.filter(r => r.status === 'rejected').length).toBe(2);
      expect(results.filter(r => r.status === 'fulfilled').length).toBe(2);
    });
  });
}); 