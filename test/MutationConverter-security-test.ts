import { MutationConverter } from "../src/mutation/MutationConverter";
import { JsonLdContextNormalized, ContextParser } from "jsonld-context-parser";
import { DataFactory } from "rdf-data-factory";

const DF = new DataFactory();

describe('MutationConverter Security Tests', () => {
  let converter: MutationConverter;
  let context: JsonLdContextNormalized;

  beforeEach(async () => {
    const contextParser = new ContextParser();
    context = await contextParser.parse({
      '@context': {
        ex: 'http://example.org/',
        foaf: 'http://xmlns.com/foaf/0.1/',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        User: 'ex:User',
        name: 'foaf:name',
        description: 'ex:description',
      },
    });
    converter = new MutationConverter(context, DF);
  });

  it('should properly escape quotes in string literals', () => {
    const inputWithQuotes = `
      mutation {
        createUser(input: {
          id: "ex:test",
          name: "Alice says \\"Hello World\\" with quotes"
        }) {
          id
          name
        }
      }
    `;

    const sparql = converter.convertToSparql(inputWithQuotes);
    
    // Should properly escape the quotes in the generated SPARQL via sparqlalgebrajs
    expect(sparql).toContain('\\"'); // Library escapes quotes
    expect(sparql).toContain('INSERT DATA');
    expect(sparql).not.toContain('"; '); // Should not have unescaped quote-semicolon patterns
  });  it('should handle newlines and special characters safely', () => {
    const inputWithSpecialChars = `
      mutation {
        createUser(input: {
          id: "ex:test",
          description: "Line 1\\nLine 2\\tTabbed\\rCarriage Return"
        }) {
          id
          description
        }
      }
    `;
    
    const sparql = converter.convertToSparql(inputWithSpecialChars);
    
    // Should properly escape newlines, tabs, carriage returns via sparqlalgebrajs
    expect(sparql).toContain('\\n');  // Library escapes \n as \\n
    expect(sparql).toContain('\\t');  // Library escapes \t as \\t  
    expect(sparql).toContain('\\r');  // Library escapes \r as \\r
  });

  it('should prevent IRI injection in named nodes', () => {
    const maliciousInput = `
      mutation {
        createUser(input: {
          id: "ex:test> } ; DELETE { ?s ?p ?o } WHERE { ?s ?p ?o } ; INSERT DATA { <ex:evil",
          name: "Test"
        }) {
          id
          name
        }
      }
    `;

    // Should throw an error due to invalid IRI characters
    expect(() => {
      converter.convertToSparql(maliciousInput);
    }).toThrow('Invalid IRI: contains illegal characters that could cause injection');
  });

  it('should handle blank node names safely', () => {
    const converter2 = new MutationConverter(context, DF);
    
    const inputWithoutId = `
      mutation {
        createUser(input: {
          name: "Test User"
        }) {
          name
        }
      }
    `;

    const sparql = converter2.convertToSparql(inputWithoutId);
    
    // Should generate valid SPARQL with skolemized IRI
    expect(sparql).toContain('INSERT DATA');
    expect(sparql).toContain('urn:uuid:');
    expect(sparql).toMatch(/urn:uuid:[0-9a-f-]{36}/);
  });

  it('should validate variable names in generated patterns', () => {
    const updateInput = `
      mutation {
        updateUser(id: "ex:test", input: {
          name: "Updated Name"
        }) {
          id
          name
        }
      }
    `;

    const sparql = converter.convertToSparql(updateInput);
    
    // Should generate proper variable names
    expect(sparql).toContain('?old_name');
    expect(sparql).toContain('DELETE');
    expect(sparql).toContain('INSERT');
    expect(sparql).toContain('WHERE');
  });
});
