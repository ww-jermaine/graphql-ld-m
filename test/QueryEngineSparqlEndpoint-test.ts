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
              o: { type: 'literal', value: 'object' }
            }
          ]
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(
          DF.variable('s'),
          DF.variable('p'),
          DF.variable('o')
        )
      ]);

      const result = await queryEngine.query(query);
      expect(result).toEqual(mockResponse);

      expect(global.fetch).toHaveBeenCalledWith(
        mockEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/sparql-results+json'
          }
        })
      );
    });

    it('should handle query timeout', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AbortError')), 50);
      }));

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(
          DF.variable('s'),
          DF.variable('p'),
          DF.variable('o')
        )
      ]);

      await expect(queryEngine.query(query, { timeout: 10 }))
        .rejects
        .toThrow(QueryEngineError);
    });

    it('should handle HTTP error responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid SPARQL query syntax')
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(
          DF.variable('s'),
          DF.variable('p'),
          DF.variable('o')
        )
      ]);

      await expect(queryEngine.query(query))
        .rejects
        .toThrow(QueryEngineError);
    });

    it('should handle invalid response format', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'format' })
      });

      const query = sparqlAlgebraFactory.createBgp([
        sparqlAlgebraFactory.createPattern(
          DF.variable('s'),
          DF.variable('p'),
          DF.variable('o')
        )
      ]);

      await expect(queryEngine.query(query))
        .rejects
        .toThrow(QueryEngineError);
    });
  });

  describe('update', () => {
    it('should execute a SPARQL update successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true
      });

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      const result = await queryEngine.update(updateQuery);

      expect(result).toEqual({
        success: true,
        message: 'Update operation completed successfully.'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        mockEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-update'
          },
          body: updateQuery
        })
      );
    });

    it('should handle update timeout', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AbortError')), 50);
      }));

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      await expect(queryEngine.update(updateQuery, { timeout: 10 }))
        .rejects
        .toThrow(QueryEngineError);
    });

    it('should handle HTTP error responses in update', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid SPARQL update syntax')
      });

      const updateQuery = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';
      await expect(queryEngine.update(updateQuery))
        .rejects
        .toThrow(QueryEngineError);
    });
  });
}); 