import {
  IriValidator,
  GraphQLInputValidator,
  SparqlValidator,
} from '../src/shared/validation/InputValidator';
import { ValidationError } from '../src/shared/errors/GraphQLLDError';

describe('IriValidator', () => {
  describe('validateIri', () => {
    it('should accept valid IRIs', () => {
      const validIRIs = [
        'http://example.com',
        'https://example.com/path',
        'http://example.com/path?query=value',
        'http://example.com/path#fragment',
        'urn:isbn:0-486-27557-4',
        'file:///path/to/file',
      ];

      validIRIs.forEach(iri => {
        expect(() => IriValidator.validateIri(iri)).not.toThrow();
      });
    });

    it('should reject invalid IRIs', () => {
      const invalidIRIs = [
        '',
        ' ',
        'not-a-uri',
        'http://',
        'http:///',
        'http://?',
        'http://#',
        'http://example.com/<script>',
        'http://example.com/"quote"',
        'http://example.com/\nlinebreak',
      ];

      invalidIRIs.forEach(iri => {
        expect(() => IriValidator.validateIri(iri)).toThrow(ValidationError);
      });
    });

    it('should include IRI in error details', () => {
      const invalidIRI = 'not-a-uri';
      try {
        IriValidator.validateIri(invalidIRI);
        fail('Should have thrown error');
      } catch (error) {
        expect(error instanceof ValidationError).toBe(true);
        if (error instanceof ValidationError) {
          expect(error.details).toEqual({ iri: invalidIRI });
        }
      }
    });
  });
});

describe('GraphQLInputValidator', () => {
  describe('validateMutationInput', () => {
    it('should accept valid input objects', () => {
      const validInputs = [
        { name: 'test' },
        { id: 'http://example.com/123', value: 42 },
        { nested: { field: true } },
        { array: [1, 2, 3] },
        { mixed: [{ id: 'http://example.com/1' }, { id: 'http://example.com/2' }] },
      ];

      validInputs.forEach(input => {
        expect(() => GraphQLInputValidator.validateMutationInput(input)).not.toThrow();
      });
    });

    it('should validate IRI fields', () => {
      const input = { id: 'not-a-uri' };
      expect(() => GraphQLInputValidator.validateMutationInput(input)).toThrow(ValidationError);
    });

    it('should reject invalid input objects', () => {
      const invalidInputs = [
        null,
        undefined,
        'string',
        42,
        true,
        [1, 2, 3],
        { func: () => {} },
        { date: new Date() },
      ];

      invalidInputs.forEach(input => {
        expect(() => GraphQLInputValidator.validateMutationInput(input as any)).toThrow(
          ValidationError
        );
      });
    });

    it('should validate nested objects', () => {
      const input = {
        user: {
          id: 'not-a-uri',
          name: 'test',
        },
      };
      expect(() => GraphQLInputValidator.validateMutationInput(input)).toThrow(ValidationError);
    });

    it('should validate array items', () => {
      const input = {
        users: [{ id: 'http://example.com/1' }, { id: 'not-a-uri' }],
      };
      expect(() => GraphQLInputValidator.validateMutationInput(input)).toThrow(ValidationError);
    });
  });
});

describe('SparqlValidator', () => {
  describe('validateQuery', () => {
    it('should accept valid SPARQL queries', () => {
      const validQueries = [
        'SELECT * WHERE { ?s ?p ?o }',
        'SELECT ?name WHERE { ?person <http://schema.org/name> ?name }',
        'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }',
        'SELECT * WHERE { ?s ?p ?o } LIMIT 100',
      ];

      validQueries.forEach(query => {
        expect(() => SparqlValidator.validateQuery(query)).not.toThrow();
      });
    });

    it('should reject queries exceeding length limit', () => {
      const longQuery = 'SELECT * WHERE { ' + '?s ?p ?o. '.repeat(1000) + '}';
      expect(() => SparqlValidator.validateQuery(longQuery)).toThrow(ValidationError);
    });

    it('should reject queries with forbidden operations', () => {
      const forbiddenQueries = [
        'DROP GRAPH <http://example.com>',
        'CREATE GRAPH <http://example.com>',
        'LOAD <http://example.com/data.ttl>',
        'CLEAR GRAPH <http://example.com>',
        'DELETE WHERE { ?s ?p ?o }',
        'DELETE DATA { <s> <p> <o> }',
        'INSERT DATA { <s> <p> <o> }',
      ];

      forbiddenQueries.forEach(query => {
        expect(() => SparqlValidator.validateQuery(query)).toThrow(ValidationError);
      });
    });

    it('should reject queries with invalid syntax', () => {
      const invalidQueries = [
        '',
        ' ',
        'INVALID QUERY',
        'ASK { ?s ?p ?o }',
        'UPDATE WHERE { ?s ?p ?o }',
        'SELECT * { invalid syntax }',
      ];

      invalidQueries.forEach(query => {
        expect(() => SparqlValidator.validateQuery(query)).toThrow(ValidationError);
      });
    });

    it('should include query in error details', () => {
      const invalidQuery = 'DROP GRAPH <http://example.com>';
      try {
        SparqlValidator.validateQuery(invalidQuery);
        fail('Should have thrown error');
      } catch (error) {
        expect(error instanceof ValidationError).toBe(true);
        if (error instanceof ValidationError) {
          expect(error.details).toEqual({ query: invalidQuery });
        }
      }
    });
  });
});
