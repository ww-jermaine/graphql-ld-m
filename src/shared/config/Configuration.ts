import { DataFactory } from 'rdf-data-factory';
import { ContextParser } from 'jsonld-context-parser';
import { ExtendedDataFactory } from '../../types/interfaces';

/**
 * Configuration options for the GraphQL-LD client
 */
export interface GraphQLLDConfig {
  baseIRI?: string;
  sparqlEndpoint?: string;
  context: Record<string, unknown>;
  dataFactory?: ExtendedDataFactory;
  contextParser?: ContextParser;
  defaultGraphs?: string[];
  namedGraphs?: string[];
  timeout?: number;
  maxQueryLength?: number;
  retryAttempts?: number;
  retryDelay?: number;
  cacheEnabled?: boolean;
  cacheMaxAge?: number;
  debug?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<GraphQLLDConfig> = {
  dataFactory: new DataFactory() as ExtendedDataFactory,
  contextParser: new ContextParser(),
  timeout: 30000,
  maxQueryLength: 2000,
  retryAttempts: 3,
  retryDelay: 1000,
  cacheEnabled: true,
  cacheMaxAge: 300000, // 5 minutes
  debug: false,
};

/**
 * Configuration manager for GraphQL-LD client
 */
export class Configuration {
  private config: GraphQLLDConfig;

  constructor(
    userConfig: Pick<GraphQLLDConfig, 'context'> & Partial<Omit<GraphQLLDConfig, 'context'>>
  ) {
    // Validate required fields
    if (!userConfig.context) {
      throw new Error('JSON-LD context is required in configuration');
    }

    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
    } as GraphQLLDConfig;
  }

  /**
   * Get the complete configuration
   */
  public getConfig(): GraphQLLDConfig {
    return { ...this.config };
  }

  /**
   * Get a specific configuration value
   */
  public get<K extends keyof GraphQLLDConfig>(key: K): GraphQLLDConfig[K] {
    return this.config[key];
  }

  /**
   * Update configuration values
   */
  public update(updates: Partial<GraphQLLDConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }
}
