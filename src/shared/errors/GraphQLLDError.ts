/**
 * Base error class for GraphQL-LD operations
 */
export class GraphQLLDError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'GraphQLLDError';
    Object.setPrototypeOf(this, GraphQLLDError.prototype);
  }

  /**
   * Creates a structured object representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Error thrown during GraphQL to SPARQL conversion
 */
export class ConversionError extends GraphQLLDError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONVERSION_ERROR', details);
    this.name = 'ConversionError';
    Object.setPrototypeOf(this, ConversionError.prototype);
  }
}

/**
 * Error thrown during input/output validation
 */
export class ValidationError extends GraphQLLDError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown during SPARQL endpoint operations
 */
export class EndpointError extends GraphQLLDError {
  constructor(message: string, details?: unknown) {
    super(message, 'ENDPOINT_ERROR', details);
    this.name = 'EndpointError';
    Object.setPrototypeOf(this, EndpointError.prototype);
  }
}

/**
 * Error thrown during JSON-LD context operations
 */
export class ContextError extends GraphQLLDError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONTEXT_ERROR', details);
    this.name = 'ContextError';
    Object.setPrototypeOf(this, ContextError.prototype);
  }
}
