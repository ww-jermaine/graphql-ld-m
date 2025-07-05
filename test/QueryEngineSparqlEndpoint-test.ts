import { QueryEngineSparqlEndpoint } from '../src/engine/QueryEngineSparqlEndpoint';
import { QueryEngineError } from '../src/types/interfaces';
import { Factory } from 'sparqlalgebrajs';
import { DataFactory } from 'rdf-data-factory';

const DF = new DataFactory();
const sparqlAlgebraFactory = new Factory(DF);

describe('QueryEngineSparqlEndpoint', () => {
  let queryEngine: QueryEngineSparqlEndpoint;
  const mockEndpoint = 'http://example.org/sparql';

  beforeEach(() => {
    queryEngine = new QueryEngineSparqlEndpoint(mockEndpoint);
    // Mock fetch globally
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('query', () => {
    it('should execute a SPARQL query successfully', async () => {
      const mockResponse = {
        head: { vars: ['s', 'p', 'o'] },
        results: {
          bindings: [
            {
              s: { type: 'uri', value: 'http://example.org/subject' },
              p: { type: 'uri', value: 'http://example.org/predicate' },
              o: { type: 'literal', value: 'object' },
            },
          ],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      const result = await queryEngine.query(query);
      expect(result).toEqual(mockResponse);

      expect(global.fetch).toHaveBeenCalledWith(
        mockEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-query',
            Accept: 'application/sparql-results+json',
          },
        })
      );
    });

    it('should handle query timeout', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 50);
          })
      );

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query, { timeout: 10 })).rejects.toThrow(QueryEngineError);
    });

    it('should handle HTTP error responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid SPARQL query syntax'),
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(QueryEngineError);
    });

    it('should handle invalid response format', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'format' }),
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(QueryEngineError);
    });
  });

  describe('update', () => {
    it('should execute a SPARQL update successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      const result = await queryEngine.update(updateQuery);

      expect(result).toEqual({
        success: true,
        message: 'Update operation completed successfully.',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        mockEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-update',
          },
          body: updateQuery,
        })
      );
    });

    it('should handle update timeout', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 50);
          })
      );

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      await expect(queryEngine.update(updateQuery, { timeout: 10 })).rejects.toThrow(
        QueryEngineError
      );
    });

    it('should handle HTTP error responses in update', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid SPARQL update syntax'),
      });

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      await expect(queryEngine.update(updateQuery)).rejects.toThrow(QueryEngineError);
    });
  });

  describe('Query Options and Limits', () => {
    it('should apply maxResults limit when specified', async () => {
      const mockResponse = {
        head: { vars: ['s'] },
        results: {
          bindings: [
            { s: { type: 'uri', value: 'http://example.org/1' } },
            { s: { type: 'uri', value: 'http://example.org/2' } },
            { s: { type: 'uri', value: 'http://example.org/3' } },
            { s: { type: 'uri', value: 'http://example.org/4' } },
            { s: { type: 'uri', value: 'http://example.org/5' } },
          ],
        },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await queryEngine.query(
        sparqlAlgebraFactory.createBgp([
          sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
        ]),
        { maxResults: 3 }
      );

      expect(result.results.bindings).toHaveLength(3);
      expect(result.results.bindings[0].s.value).toBe('http://example.org/1');
      expect(result.results.bindings[2].s.value).toBe('http://example.org/3');
    });

    it('should not apply maxResults limit when not specified', async () => {
      const mockResponse = {
        head: { vars: ['s'] },
        results: {
          bindings: [
            { s: { type: 'uri', value: 'http://example.org/1' } },
            { s: { type: 'uri', value: 'http://example.org/2' } },
            { s: { type: 'uri', value: 'http://example.org/3' } },
          ],
        },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await queryEngine.query(
        sparqlAlgebraFactory.createBgp([
          sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
        ])
      );

      expect(result.results.bindings).toHaveLength(3);
    });

    it('should handle query timeout with AbortError', async () => {
      // Mock AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      global.fetch = jest.fn().mockRejectedValueOnce(abortError);

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query, { timeout: 100 })).rejects.toThrow(
        'Query timed out after 100ms'
      );
    });

    it('should handle unknown error types in query', async () => {
      // Mock a non-Error object being thrown
      global.fetch = jest.fn().mockRejectedValueOnce('string error');

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(
        'Unknown error occurred during query execution'
      );
    });
  });

  describe('Update Options and Error Handling', () => {
    it('should handle update timeout with AbortError', async () => {
      // Mock AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      global.fetch = jest.fn().mockRejectedValueOnce(abortError);

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      await expect(queryEngine.update(updateQuery, { timeout: 100 })).rejects.toThrow(
        'Update operation timed out after 100ms'
      );
    });

    it('should handle unknown error types in update', async () => {
      // Mock a non-Error object being thrown
      global.fetch = jest.fn().mockRejectedValueOnce('string error');

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      await expect(queryEngine.update(updateQuery)).rejects.toThrow(
        'Unknown error occurred during update operation'
      );
    });

    it('should handle non-Error objects in update', async () => {
      // Mock a non-Error object being thrown
      global.fetch = jest.fn().mockRejectedValueOnce({ message: 'custom error object' });

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      await expect(queryEngine.update(updateQuery)).rejects.toThrow(
        'Unknown error occurred during update operation'
      );
    });
  });

  describe('Response Validation', () => {
    it('should throw error for invalid SPARQL response structure (missing head)', async () => {
      const invalidResponse = {
        // Missing head
        results: { bindings: [] },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(
        'Invalid SPARQL JSON response structure'
      );
    });

    it('should throw error for invalid SPARQL response structure (missing results)', async () => {
      const invalidResponse = {
        head: { vars: ['s'] },
        // Missing results
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(
        'Invalid SPARQL JSON response structure'
      );
    });

    it('should throw error for invalid SPARQL response structure (invalid head.vars)', async () => {
      const invalidResponse = {
        head: { vars: 'not-an-array' },
        results: { bindings: [] },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(
        'Invalid SPARQL JSON response structure'
      );
    });

    it('should throw error for invalid SPARQL response structure (invalid results.bindings)', async () => {
      const invalidResponse = {
        head: { vars: ['s'] },
        results: { bindings: 'not-an-array' },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(
        'Invalid SPARQL JSON response structure'
      );
    });

    it('should throw error for null response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
      ]);

      await expect(queryEngine.query(query)).rejects.toThrow(
        'Invalid SPARQL JSON response structure'
      );
    });
  });
});
