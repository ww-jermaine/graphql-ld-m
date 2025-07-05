import {
  GraphQLLDError,
  ConversionError,
  ValidationError,
  EndpointError,
  ContextError,
} from '../src/shared/errors/GraphQLLDError';

describe('GraphQLLDError', () => {
  it('should create base error with message and code', () => {
    const error = new GraphQLLDError('Test error', 'TEST_ERROR');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('GraphQLLDError');
  });

  it('should create base error with details', () => {
    const details = { foo: 'bar' };
    const error = new GraphQLLDError('Test error', 'TEST_ERROR', details);
    expect(error.details).toEqual(details);
  });

  it('should serialize to JSON correctly', () => {
    const details = { foo: 'bar' };
    const error = new GraphQLLDError('Test error', 'TEST_ERROR', details);
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'GraphQLLDError',
      message: 'Test error',
      code: 'TEST_ERROR',
      details: details,
    });
  });

  describe('ConversionError', () => {
    it('should create conversion error with correct code', () => {
      const error = new ConversionError('Conversion failed');
      expect(error.message).toBe('Conversion failed');
      expect(error.code).toBe('CONVERSION_ERROR');
      expect(error.name).toBe('ConversionError');
    });

    it('should include details in conversion error', () => {
      const details = { query: 'test query' };
      const error = new ConversionError('Conversion failed', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should include details in validation error', () => {
      const details = { field: 'username' };
      const error = new ValidationError('Invalid input', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('EndpointError', () => {
    it('should create endpoint error with correct code', () => {
      const error = new EndpointError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('ENDPOINT_ERROR');
      expect(error.name).toBe('EndpointError');
    });

    it('should include details in endpoint error', () => {
      const details = { url: 'http://example.com' };
      const error = new EndpointError('Connection failed', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('ContextError', () => {
    it('should create context error with correct code', () => {
      const error = new ContextError('Invalid context');
      expect(error.message).toBe('Invalid context');
      expect(error.code).toBe('CONTEXT_ERROR');
      expect(error.name).toBe('ContextError');
    });

    it('should include details in context error', () => {
      const details = { context: { '@context': {} } };
      const error = new ContextError('Invalid context', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('Error inheritance', () => {
    it('should maintain instanceof relationships', () => {
      const conversionError = new ConversionError('test');
      const validationError = new ValidationError('test');
      const endpointError = new EndpointError('test');
      const contextError = new ContextError('test');

      expect(conversionError instanceof GraphQLLDError).toBe(true);
      expect(validationError instanceof GraphQLLDError).toBe(true);
      expect(endpointError instanceof GraphQLLDError).toBe(true);
      expect(contextError instanceof GraphQLLDError).toBe(true);
      expect(conversionError instanceof Error).toBe(true);
    });
  });
});
