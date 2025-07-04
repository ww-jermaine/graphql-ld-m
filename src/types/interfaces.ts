import { DocumentNode } from "graphql/language";
import { Algebra } from "sparqlalgebrajs";
import { JsonLdContext, ContextParser } from "jsonld-context-parser";
import { Converter as GraphQlToSparqlConverter } from "graphql-to-sparql";
import { Converter as SparqlJsonToTreeConverter } from "sparqljson-to-tree";
import * as RDF from "@rdfjs/types";
import { ISingularizeVariables } from "graphql-to-sparql/lib/IConvertContext";

/**
 * Custom error type for query engine related errors
 */
export class QueryEngineError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'QueryEngineError';
  }
}

/**
 * Options for query engine operations
 */
export interface QueryEngineOptions {
  timeout?: number;
  maxResults?: number;
  validateQuery?: boolean;
}

/**
 * Result type for SPARQL query operations
 */
export interface SparqlQueryResult {
  head: {
    vars: string[];
  };
  results: {
    bindings: Record<string, { 
      type: string;
      value: string;
      datatype?: string;
      "xml:lang"?: string;
    }>[];
  };
}

/**
 * Result type for SPARQL update operations
 */
export interface SparqlUpdateResult {
  success: boolean;
  message?: string;
  details?: unknown;
}

/**
 * A query engine that takes SPARQL algebra and outputs SPARQL JSON.
 */
export interface QueryEngine {
  /**
   * Execute SPARQL algebra against a query engine.
   * @param {Operation} query A SPARQL query in SPARQL algebra.
   * @param options Optional options for the query engine.
   * @throws {QueryEngineError} When query execution fails
   */
  query(query: Algebra.Operation, options?: QueryEngineOptions): Promise<SparqlQueryResult>;

  /**
   * Execute a SPARQL update operation against a query engine.
   * @param {string} query A SPARQL update query as a string.
   * @param options Optional options for the query engine.
   * @throws {QueryEngineError} When update operation fails
   */
  update?(query: string, options?: QueryEngineOptions): Promise<SparqlUpdateResult>;
}

/**
 * Arguments for initializing a GraphQL-LD client
 */
export interface ClientArgs {
  /** A JSON-LD context that may be an object, array, or string URL to remote context */
  readonly context: JsonLdContext;
  
  /** Query engine used to execute SPARQL queries */
  readonly queryEngine: QueryEngine;
  
  /** Optional base IRI */
  readonly baseIRI?: string;
  
  /** Optional data factory for RDF quads and terms */
  readonly dataFactory?: RDF.DataFactory;
  
  /** Optional JSON-LD context parser to override defaults */
  readonly contextParser?: ContextParser;
  
  /** Optional GraphQL to SPARQL converter to override defaults */
  readonly graphqlToSparqlConverter?: GraphQlToSparqlConverter;
  
  /** Optional SPARQL-JSON to GraphQL tree converter to override defaults */
  readonly sparqlJsonToTreeConverter?: SparqlJsonToTreeConverter;
}

export interface QueryArgsRaw {
  readonly query: string | DocumentNode;
  readonly variables?: { readonly [key: string]: unknown };
  readonly queryEngineOptions?: QueryEngineOptions;
}

export interface QueryArgsSparql extends GraphQlToSparqlResult {
  readonly queryEngineOptions?: QueryEngineOptions;
}

export interface GraphQlToSparqlResult {
  readonly sparqlAlgebra: Algebra.Operation;
  readonly singularizeVariables: ISingularizeVariables;
}

/**
 * Extended DataFactory interface that includes variable creation
 */
export interface ExtendedDataFactory extends RDF.DataFactory {
  variable(value: string): RDF.Variable;
}

/**
 * Union type for query arguments
 */
export type QueryArgs = QueryArgsRaw | QueryArgsSparql; 