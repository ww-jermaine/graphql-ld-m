import { Algebra, toSparql } from 'sparqlalgebrajs';
import {
  QueryEngine,
  QueryEngineOptions,
  QueryEngineError,
  SparqlQueryResult,
  SparqlUpdateResult
} from '../types/interfaces';

// Declare global fetch for Node.js 18+ built-in fetch support
declare const fetch: typeof globalThis.fetch;

export class QueryEngineSparqlEndpoint implements QueryEngine {
  private readonly endpointUrl: string;
  private readonly updateEndpointUrl: string;
  private readonly defaultOptions: QueryEngineOptions = {
    timeout: 30000, // 30 seconds default timeout
    maxResults: 1000,
    validateQuery: true
  };

  constructor(endpointUrl: string, updateEndpointUrl?: string) {
    this.endpointUrl = endpointUrl;
    this.updateEndpointUrl = updateEndpointUrl || endpointUrl;
  }

  async query(sparqlAlgebra: Algebra.Operation, options?: QueryEngineOptions): Promise<SparqlQueryResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const sparql = toSparql(sparqlAlgebra);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), mergedOptions.timeout);

      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/sparql-results+json'
        },
        body: sparql,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new QueryEngineError(
          `SPARQL query failed: ${response.statusText} - ${errorText}`,
          `HTTP_${response.status}`
        );
      }

      const result = await response.json() as unknown;

      // Type guard for SPARQL JSON result
      if (!this.isSparqlQueryResult(result)) {
        throw new QueryEngineError(
          'Invalid SPARQL JSON response structure',
          'INVALID_RESPONSE_FORMAT'
        );
      }

      // Apply maxResults limit if specified
      if (mergedOptions.maxResults && result.results.bindings.length > mergedOptions.maxResults) {
        result.results.bindings = result.results.bindings.slice(0, mergedOptions.maxResults);
      }

      return result;
    } catch (error: unknown) {
      if (error instanceof QueryEngineError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new QueryEngineError(
            `Query timed out after ${mergedOptions.timeout}ms`,
            'TIMEOUT'
          );
        }
        throw new QueryEngineError(
          `Query execution failed: ${error.message}`,
          'EXECUTION_ERROR'
        );
      }
      throw new QueryEngineError(
        'Unknown error occurred during query execution',
        'UNKNOWN_ERROR'
      );
    }
  }

  async update(sparqlUpdate: string, options?: QueryEngineOptions): Promise<SparqlUpdateResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), mergedOptions.timeout);

      const response = await fetch(this.updateEndpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-update'
        },
        body: sparqlUpdate,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new QueryEngineError(
          `SPARQL UPDATE failed: ${response.statusText} - ${errorText}`,
          `HTTP_${response.status}`
        );
      }
      
      return { 
        success: true, 
        message: "Update operation completed successfully." 
      };
    } catch (error: unknown) {
      if (error instanceof QueryEngineError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new QueryEngineError(
            `Update operation timed out after ${mergedOptions.timeout}ms`,
            'TIMEOUT'
          );
        }
        throw new QueryEngineError(
          `Update operation failed: ${error.message}`,
          'EXECUTION_ERROR'
        );
      }
      throw new QueryEngineError(
        'Unknown error occurred during update operation',
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Type guard to validate SPARQL query result structure
   */
  private isSparqlQueryResult(result: unknown): result is SparqlQueryResult {
    if (!result || typeof result !== 'object') return false;
    
    const r = result as Record<string, unknown>;
    if (!r['head'] || typeof r['head'] !== 'object') return false;
    
    const head = r['head'] as Record<string, unknown>;
    if (!Array.isArray(head['vars'])) return false;
    
    if (!r['results'] || typeof r['results'] !== 'object') return false;
    
    const results = r['results'] as Record<string, unknown>;
    if (!Array.isArray(results['bindings'])) return false;
    
    return true;
  }
}
