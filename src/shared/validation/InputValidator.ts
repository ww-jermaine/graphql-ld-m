import { ValidationError } from '../errors/GraphQLLDError';

/**
 * Validates IRI strings according to RFC 3987
 */
export class IriValidator {
  private static readonly SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
  private static readonly GENERAL_IRI_PATTERN = /^[a-z][a-z0-9+.-]*:[^<>"{}|\\^`\x00-\x20]*$/i;
  private static readonly DISALLOWED_CHARS = /[\x00-\x20<>"{}|\\^`]/;

  /**
   * Validate an IRI string
   */
  public static validateIri(iri: string): void {
    if (!iri || typeof iri !== 'string' || iri.trim() === '') {
      throw new ValidationError('Invalid IRI: must be a non-empty string', { iri });
    }

    // Check for disallowed characters first
    if (this.DISALLOWED_CHARS.test(iri)) {
      throw new ValidationError('Invalid IRI: contains disallowed characters', { iri });
    }

    // Check if the IRI has a valid scheme
    if (!this.SCHEME_PATTERN.test(iri)) {
      throw new ValidationError('Invalid IRI: missing or invalid scheme', { iri });
    }

    // Special case for URNs
    if (iri.startsWith('urn:')) {
      if (!/^urn:[a-z0-9][a-z0-9-]{0,31}:[a-z0-9()+,\-.:=@;$_!*'%/?#]+$/i.test(iri)) {
        throw new ValidationError('Invalid URN format', { iri });
      }
      return;
    }

    // Special case for file URIs
    if (iri.startsWith('file:')) {
      if (!/^file:\/\/\/[^<>"{}|\\^`\x00-\x20]+$/.test(iri)) {
        throw new ValidationError('Invalid file URI format', { iri });
      }
      return;
    }

    // For HTTP(S) URIs, use URL constructor for validation
    if (iri.startsWith('http://') || iri.startsWith('https://')) {
      try {
        const url = new URL(iri);
        if (!url.hostname || url.hostname === '') {
          throw new Error('Missing hostname');
        }
        return;
      } catch (error) {
        throw new ValidationError('Invalid HTTP(S) URI format', { iri });
      }
    }

    // For other schemes, use general IRI pattern
    if (!this.GENERAL_IRI_PATTERN.test(iri)) {
      throw new ValidationError('Invalid IRI format', { iri });
    }

    // Additional validation for non-HTTP schemes
    if (iri.includes('//') && !iri.startsWith('file:')) {
      throw new ValidationError('Invalid IRI: double slashes only allowed in HTTP(S) and file URIs', { iri });
    }
  }
}

/**
 * Validates GraphQL mutation input objects
 */
export class GraphQLInputValidator {
  /**
   * Validate a mutation input object
   */
  public static validateMutationInput(input: unknown): void {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError('Invalid input: must be a non-null object', { input });
    }

    // Validate each field recursively
    for (const [key, value] of Object.entries(input)) {
      // Validate IRI fields
      if (key.toLowerCase().includes('id') && typeof value === 'string') {
        try {
          IriValidator.validateIri(value);
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new ValidationError(`Invalid IRI in field "${key}": ${error.message}`, {
              key,
              value,
              details: error.details
            });
          }
          throw error;
        }
      }

      // Validate arrays
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item && typeof item === 'object') {
            try {
              GraphQLInputValidator.validateMutationInput(item);
            } catch (error) {
              if (error instanceof ValidationError) {
                throw new ValidationError(`Invalid array item at index ${index} in field "${key}": ${error.message}`, {
                  key,
                  index,
                  details: error.details
                });
              }
              throw error;
            }
          }
        });
      }
      // Validate nested objects
      else if (value && typeof value === 'object') {
        try {
          GraphQLInputValidator.validateMutationInput(value);
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new ValidationError(`Invalid nested object in field "${key}": ${error.message}`, {
              key,
              details: error.details
            });
          }
          throw error;
        }
      }

      // Validate value types
      if (value instanceof Date || value instanceof Function) {
        throw new ValidationError(`Invalid value type at key "${key}"`, {
          key,
          type: value.constructor.name
        });
      }
    }
  }
}

/**
 * Validates SPARQL queries
 */
export class SparqlValidator {
  private static readonly MAX_QUERY_LENGTH = 10000;
  private static readonly FORBIDDEN_OPERATIONS = [
    'DROP',
    'CREATE',
    'LOAD',
    'CLEAR',
    'DELETE',
    'INSERT',
    'UPDATE'
  ];

  /**
   * Validate a SPARQL query string
   */
  public static validateQuery(query: string): void {
    if (!query || typeof query !== 'string') {
      throw new ValidationError('Invalid query: must be a non-empty string', { query });
    }

    // Check query length
    if (query.length > SparqlValidator.MAX_QUERY_LENGTH) {
      throw new ValidationError('Query exceeds maximum length', {
        query,
        maxLength: SparqlValidator.MAX_QUERY_LENGTH,
        actualLength: query.length
      });
    }

    // Check for forbidden operations
    const upperQuery = query.toUpperCase();
    for (const operation of SparqlValidator.FORBIDDEN_OPERATIONS) {
      if (upperQuery.includes(operation)) {
        throw new ValidationError(`Query contains forbidden operation: ${operation}`, { query });
      }
    }

    // Basic syntax validation
    if (!upperQuery.startsWith('SELECT') && !upperQuery.startsWith('CONSTRUCT')) {
      throw new ValidationError('Query must start with SELECT or CONSTRUCT', { query });
    }

    // Check for basic structure
    if (!upperQuery.includes('WHERE')) {
      throw new ValidationError('Query must contain WHERE clause', { query });
    }

    // Check for balanced braces
    let braceCount = 0;
    for (const char of query) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (braceCount < 0) {
        throw new ValidationError('Query has unbalanced braces', { query });
      }
    }
    if (braceCount !== 0) {
      throw new ValidationError('Query has unbalanced braces', { query });
    }
  }
} 