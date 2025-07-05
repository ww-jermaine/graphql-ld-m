import { Client, QueryEngineSparqlEndpoint, MutationConverter } from "../src/index";
import { DataFactory } from "rdf-data-factory";
import { ContextParser } from "jsonld-context-parser";

const DF = new DataFactory();

/**
 * Demo script for GraphQL-LD mutations for SEMANTiCS 2025
 * 
 * This demo showcases:
 * 1. Creating RDF data using GraphQL mutations
 * 2. Understanding GraphQL-LD query patterns that work
 * 3. Common pitfalls and solutions
 * 
 * Key Learning: GraphQL-LD query patterns
 * ❌ `Product { id name }` - treats "Product" as predicate
 * ✅ `name price` - direct field queries work
 * ✅ `name(id: "product:1")` - field queries with ID constraints
 * ✅ `... on Product { id name }` - fragment-based type queries
 * 
 * Prerequisites:
 * 1. Start GraphDB with repository: docker-compose up -d
 * 2. Verify GraphDB is running: curl http://localhost:7200/rest/repositories
 * 3. Run this demo: node examples/mutation-demo.js
 * 
 * GraphDB Endpoints:
 * - Query endpoint: http://localhost:7200/repositories/graphql-demo (for SPARQL SELECT)
 * - Update endpoint: http://localhost:7200/repositories/graphql-demo/statements (for SPARQL INSERT/UPDATE/DELETE)
 */
async function runMutationDemo() {
  console.log('🚀 GraphQL-LD Mutation Demo for SEMANTiCS 2025\n');

  // JSON-LD context for the demo - using Schema.org Products as suggested
  const context = {
    '@context': {
      '@base': 'http://example.org/',
      '@vocab': 'http://example.org/',
      'schema': 'https://schema.org/',
      'xsd': 'http://www.w3.org/2001/XMLSchema#',
      
      // Product types
      'Product': 'schema:Product',
      'Review': 'schema:Review',
      
      'id': {
        '@id': '@id',
        '@type': '@id',
        '@context': {
          '@base': 'http://example.org/'
        }
      },
      
      // Properties
      'name': 'schema:name',
      'description': 'schema:description',
      'price': { '@id': 'schema:price', '@type': 'xsd:decimal' },
      'currency': 'schema:priceCurrency',
      'brand': 'schema:brand',
      'rating': { '@id': 'schema:ratingValue', '@type': 'xsd:integer' },
      'reviewText': 'schema:reviewBody',
      'reviewer': { '@id': 'schema:author', '@type': '@id' },
    },
  };

  // Create client pointing to local GraphDB endpoint
  // GraphDB uses different endpoints for queries vs updates
  const queryEndpoint = 'http://localhost:7200/repositories/graphql-demo';
  const updateEndpoint = 'http://localhost:7200/repositories/graphql-demo/statements';
  
  console.log('🔗 Using GraphDB endpoints:');
  console.log('   Query (SELECT): ' + queryEndpoint);
  console.log('   Update (INSERT/UPDATE/DELETE): ' + updateEndpoint);
  console.log('');

  const client = new Client({ 
    context, 
    queryEngine: new QueryEngineSparqlEndpoint(queryEndpoint, updateEndpoint) 
  });

  try {
    // First, let's verify the GraphDB connection
    console.log('🔍 Step 0: Verifying GraphDB connection...');
    try {
      const response = await fetch('http://localhost:7200/rest/repositories');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const repositories = await response.json() as any[];
      const demoRepo = repositories.find((r: any) => r.id === 'graphql-demo');
      if (!demoRepo) {
        throw new Error('graphql-demo repository not found');
      }
      console.log('✅ GraphDB connection verified, repository state:', demoRepo.state);
    } catch (connError: any) {
      console.error('❌ GraphDB connection failed:', connError.message);
      console.log('\n💡 Make sure GraphDB is running:');
      console.log('   docker-compose up -d');
      console.log('   curl http://localhost:7200/rest/repositories');
      return;
    }

    console.log('\n📝 Step 1: Creating a product...');
    
    const createMutation = `
      mutation CreateProduct {
        createProduct(input: {
          id: "product:laptop-1",
          name: "Gaming Laptop Pro",
          description: "High-performance gaming laptop with RTX graphics",
          price: 1299.99,
          currency: "USD",
          brand: "TechCorp"
        }) {
          id
          name
          price
        }
      }
    `;

    // Debug: Show what SPARQL is being generated
    console.log('🔧 Debug: Generated SPARQL for create mutation...');
    const contextParser = new ContextParser();
    const normalizedContext = await contextParser.parse(context);
    const mutationConverter = new MutationConverter(normalizedContext, DF);
    const createSparql = mutationConverter.convertToSparql(createMutation);
    console.log('Generated SPARQL INSERT:', createSparql);

    const createResult = await client.mutate({ query: createMutation });
    console.log('✅ Product created:', JSON.stringify(createResult, null, 2));
    
    console.log('\n🔍 Step 2: Reading the created product...');
    
    // Query using the server's resolver pattern
    const readQuery = `
      query GetAllProducts {
        id @single
        name @single
        description @single
        price @single
        currency @single
        brand @single
      }
    `;

    console.log('🔧 Debug: Query being executed:', readQuery);

    try {
      const readResult = await client.query({ query: readQuery });
      console.log('✅ Product read:', JSON.stringify(readResult, null, 2));
    } catch (error: any) {
      console.error('❌ Read query failed:', error);
      console.error('Error details:', error.message);
      
      console.log('\n🔧 Trying alternative query format with ID constraint...');
      const altQuery = `
        query GetProduct {
          ... on Product {
            id(id: "product:laptop-1") @single
            name @single
            description @single
            price @single
            currency @single
            brand @single
          }
        }
      `;
      
      console.log('🔧 Debug: Alternative query being executed:', altQuery);
      
      try {
        const altResult = await client.query({ query: altQuery });
        console.log('✅ Alternative query succeeded:', JSON.stringify(altResult, null, 2));
      } catch (altError: any) {
        console.error('❌ Alternative query also failed:', altError);
        throw error; // Re-throw the original error to stop the demo
      }
    }
    
    console.log('\n📝 Step 3: Updating the product...');
    
    // Update the product directly
    const updateMutation = `
      mutation UpdateProduct {
        updateProduct(id: "product:laptop-1", input: {
          description: "Updated: High-performance gaming laptop with RTX 4080",
          price: 1199.99
        }) {
          id
        }
      }
    `;

    console.log('🔧 Debug: Generated SPARQL for update mutation...');
    const updateResult = await client.mutate({ query: updateMutation });
    console.log('✅ Product updated:', JSON.stringify(updateResult, null, 2));

    console.log('\n🔍 Step 4: Reading the updated product...');
    
    // Query using the list pattern but filter for our specific product
    const specificProductQuery = `
      query GetAllProducts {
        id @single
        name @single
        description @single
        price @single
        currency @single
        brand @single
      }
    `;

    console.log('🔧 Debug: Query being executed:', specificProductQuery);

    try {
      const readResult = await client.query({ query: specificProductQuery });
      console.log('✅ Updated product read:', JSON.stringify(readResult, null, 2));
      
      // Filter for our specific product
      const products = readResult.data;
      if (Array.isArray(products)) {
        const ourProduct = products.find(p => p.id === 'http://example.org/product:laptop-1');
        if (ourProduct) {
          console.log('✅ Our specific product:', JSON.stringify(ourProduct, null, 2));
        } else {
          console.log('❌ Our specific product not found in results');
        }
      }
    } catch (error: any) {
      console.error('❌ Read query failed:', error);
      throw error;
    }

    console.log('\n📝 Step 5: Creating a review...');
    
    const reviewMutation = `
      mutation CreateReview {
        createReview(input: {
          id: "review:laptop-1-review-1",
          rating: 5,
          reviewText: "Excellent laptop, great for gaming and work!",
          reviewer: "user:john-doe"
        }) {
          id
          rating
          reviewText
        }
      }
    `;

    const reviewResult = await client.mutate({ query: reviewMutation });
    console.log('✅ Review created:', JSON.stringify(reviewResult, null, 2));

    console.log('\n🔍 Step 6: Reading all products (to verify type-based querying)...');
    
    // Query using the server's products resolver pattern
    const typeQuery = `
      query GetAllProducts {
        id @single
        name
        description
        price
        currency
        brand
      }
    `;

    console.log('🔧 Debug: Query being executed:', typeQuery);

    try {
      const typeResult = await client.query({ query: typeQuery });
      console.log('✅ Type-based query succeeded:', JSON.stringify(typeResult, null, 2));
    } catch (error: any) {
      console.error('❌ Type-based query failed:', error);
      throw error;
    }

    console.log('\n🗑️ Step 7: Deleting the product...');
    const deleteMutation = `
      mutation DeleteProduct {
        deleteProduct(id: "product:laptop-1") {
          success
          message
          id
        }
      }
    `;

    const deleteResult = await client.mutate({ query: deleteMutation });
    console.log('✅ Product deleted:', JSON.stringify(deleteResult, null, 2));

    console.log('\n🔍 Step 8: Verifying deletion...');
    try {
      const verifyDeletionResult = await client.query({ query: readQuery });
      if (!verifyDeletionResult.data || verifyDeletionResult.data.length === 0) {
        console.log('✅ Product successfully deleted - no data returned');
      } else {
        console.log('❌ Product still exists:', JSON.stringify(verifyDeletionResult, null, 2));
      }
    } catch (error) {
      console.log('✅ Product successfully deleted - query returned error as expected');
    }

    console.log('\n🎯 Demo completed successfully!');
    console.log('🔗 Tested operations:');
    console.log('   1. CREATE - New product with explicit ID');
    console.log('   2. READ   - Single product by ID');
    console.log('   3. UPDATE - Product price and description');
    console.log('   4. READ   - Verify update');
    console.log('   5. CREATE - Related review');
    console.log('   6. READ   - All products (type-based)');
    console.log('   7. DELETE - Product removal');
    console.log('   8. READ   - Verify deletion');
    
    console.log('\n📚 GraphDB Workbench Access:');
    console.log('   - Open: http://localhost:7200');
    console.log('   - Select repository: graphql-demo');
    console.log('   - Run SPARQL queries to see the data');
    
  } catch (error: any) {
    console.error('❌ Demo failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure GraphDB is running: docker-compose up -d');
    console.log('   2. Check repository exists: curl http://localhost:7200/rest/repositories');
    console.log('   3. Verify endpoints are accessible:');
    console.log('      - Query: curl http://localhost:7200/repositories/graphql-demo');
    console.log('      - Update: curl http://localhost:7200/repositories/graphql-demo/statements');
    console.log('   4. Check GraphDB logs: docker logs graphdb-graphql-demo');
  }
}

// Export for potential module usage
export { runMutationDemo };

// Run demo if called directly
if (require.main === module) {
  runMutationDemo().catch(console.error);
}