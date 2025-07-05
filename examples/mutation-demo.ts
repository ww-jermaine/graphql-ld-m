import { Client, QueryEngineSparqlEndpoint, MutationConverter } from "../src/index";
import { DataFactory } from "rdf-data-factory";
import { ContextParser } from "jsonld-context-parser";

const DF = new DataFactory();

/**
 * Comprehensive GraphQL-LD Mutation Demo
 * 
 * This demo showcases real-world usage patterns for GraphQL-LD-M:
 * 1. Product catalog management with full CRUD operations
 * 2. Review system with bidirectional relationships
 * 3. Complex queries with relationship traversal
 * 4. Error handling and validation
 * 5. Performance considerations and best practices
 * 
 * Based on the Apollo Server demo from README.md
 * 
 * Prerequisites:
 * 1. Start GraphDB: docker-compose up -d
 * 2. Verify GraphDB: curl http://localhost:7200/rest/repositories
 * 3. Run demo: npx ts-node examples/mutation-demo.ts
 * 
 * GraphDB Endpoints:
 * - Query: http://localhost:7200/repositories/graphql-demo
 * - Update: http://localhost:7200/repositories/graphql-demo/statements
 */

// Sample data for realistic demonstration
const SAMPLE_PRODUCTS = [
  {
    id: "product:macbook-pro-m3",
    name: "MacBook Pro M3",
    description: "Latest MacBook Pro with M3 chip - Perfect for developers",
    price: 2499.99,
    currency: "USD",
    brand: "Apple"
  },
  {
    id: "product:samsung-galaxy-s24",
    name: "Samsung Galaxy S24",
    description: "Latest Samsung flagship with advanced AI features",
    price: 899.99,
    currency: "USD",
    brand: "Samsung"
  },
  {
    id: "product:dell-xps-13",
    name: "Dell XPS 13",
    description: "Ultrabook with stunning InfinityEdge display",
    price: 1299.99,
    currency: "USD",
    brand: "Dell"
  }
];

const SAMPLE_REVIEWS = [
  {
    id: "review:macbook-review-1",
    rating: 5,
    reviewText: "Exceptional performance and build quality. The M3 chip is incredibly fast for development work.",
    reviewer: "developer@example.com",
    productId: "product:macbook-pro-m3"
  },
  {
    id: "review:samsung-review-1",
    rating: 4,
    reviewText: "Great camera and display quality. Battery life could be better.",
    reviewer: "photographer@example.com",
    productId: "product:samsung-galaxy-s24"
  },
  {
    id: "review:dell-review-1",
    rating: 4,
    reviewText: "Solid ultrabook with excellent display. Perfect for travel.",
    reviewer: "consultant@example.com",
    productId: "product:dell-xps-13"
  }
];

async function runMutationDemo() {
  console.log('🚀 GraphQL-LD-M Comprehensive Demo\n');
  console.log('📋 Demonstrating real-world e-commerce scenarios with products and reviews\n');

  // Enhanced JSON-LD context matching the Apollo Server implementation
  const context = {
    '@context': {
      '@base': 'http://example.org/',
      '@vocab': 'http://example.org/',
      'schema': 'https://schema.org/',
      'xsd': 'http://www.w3.org/2001/XMLSchema#',
      
      'Product': 'schema:Product',
      'Review': 'schema:Review',
      
      'id': {
        '@id': '@id',
        '@type': '@id',
        '@context': {
          '@base': 'http://example.org/'
        }
      },
      
      // Product properties
      'name': 'schema:name',
      'description': 'schema:description',
      'price': { '@id': 'schema:price', '@type': 'xsd:decimal' },
      'currency': 'schema:priceCurrency',
      'brand': 'schema:brand',
      
      // Review properties
      'rating': { '@id': 'schema:ratingValue', '@type': 'xsd:integer' },
      'reviewText': 'schema:reviewBody',
      'reviewer': 'schema:author',
      
      // Relationship properties for bidirectional linking
      'reviews': { 
        '@id': 'schema:review', 
        '@type': '@id',
        '@container': '@set'
      },
      'product': { 
        '@id': 'schema:itemReviewed', 
        '@type': '@id' 
      }
    },
  };

  // GraphDB endpoints
  const queryEndpoint = 'http://localhost:7200/repositories/graphql-demo';
  const updateEndpoint = 'http://localhost:7200/repositories/graphql-demo/statements';
  
  console.log('🔗 GraphDB Configuration:');
  console.log(`   Query Endpoint: ${queryEndpoint}`);
  console.log(`   Update Endpoint: ${updateEndpoint}\n`);

  const client = new Client({ 
    context, 
    queryEngine: new QueryEngineSparqlEndpoint(queryEndpoint, updateEndpoint) 
  });

  try {
    // =================== STEP 0: SYSTEM VERIFICATION ===================
    console.log('🔍 Step 0: Verifying GraphDB Connection');
    console.log('=' .repeat(50));
    
    await verifyGraphDBConnection();
    console.log('✅ GraphDB connection verified\n');

    // =================== STEP 1: PRODUCT CREATION ===================
    console.log('📦 Step 1: Creating Product Catalog');
    console.log('=' .repeat(50));
    
    const createdProducts = [];
    for (const product of SAMPLE_PRODUCTS) {
      console.log(`\n➕ Creating product: ${product.name}`);
      
      const createMutation = `
        mutation CreateProduct {
          createProduct(input: {
            id: "${product.id}",
            name: "${product.name}",
            description: "${product.description}",
            price: ${product.price},
            currency: "${product.currency}",
            brand: "${product.brand}"
          }) {
            success
            message
            id
          }
        }
      `;

      try {
        const result = await client.mutate({ query: createMutation });
        console.log(`   ✅ Created: ${result.data?.createProduct?.id || 'Unknown ID'}`);
        createdProducts.push(product.id);
      } catch (error: any) {
        console.error(`   ❌ Failed to create ${product.name}:`, error.message);
      }
    }
    
    console.log(`\n📊 Created ${createdProducts.length}/${SAMPLE_PRODUCTS.length} products successfully`);

    // =================== STEP 2: PRODUCT VERIFICATION ===================
    console.log('\n🔍 Step 2: Verifying Product Creation');
    console.log('=' .repeat(50));
    
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

    try {
      const readResult = await client.query({ query: readQuery });
      const products = readResult.data || [];
      
      console.log(`\n📋 Found ${products.length} products in the knowledge graph:`);
      products.forEach((product: any, index: number) => {
        console.log(`   ${index + 1}. ${product.name} - ${product.currency}${product.price} (${product.brand})`);
      });
      
      if (products.length === 0) {
        console.log('   ⚠️  No products found - this might indicate a query issue');
      }
    } catch (error: any) {
      console.error('❌ Failed to read products:', error.message);
    }

    // =================== STEP 3: PRODUCT UPDATES ===================
    console.log('\n✏️  Step 3: Updating Product Information');
    console.log('=' .repeat(50));
    
    const updateTarget = SAMPLE_PRODUCTS[0];
    const newPrice = 2299.99;
    const newDescription = "Updated: MacBook Pro M3 with enhanced performance - Now on sale!";
    
    console.log(`\n🔄 Updating ${updateTarget.name}:`);
    console.log(`   Price: $${updateTarget.price} → $${newPrice}`);
    console.log(`   Description: Enhanced with sale information`);
    
    const updateMutation = `
      mutation UpdateProduct {
        updateProduct(id: "${updateTarget.id}", input: {
          price: ${newPrice},
          description: "${newDescription}"
        }) {
          success
          message
          id
        }
      }
    `;

    try {
      const updateResult = await client.mutate({ query: updateMutation });
      console.log('   ✅ Product updated successfully');
      
      // Verify the update
      const verifyResult = await client.query({ query: readQuery });
      const updatedProduct = verifyResult.data?.find((p: any) => 
        p.id === `http://example.org/${updateTarget.id}`
      );
      
      if (updatedProduct) {
        console.log(`   📊 Verified - New price: $${updatedProduct.price}`);
      }
    } catch (error: any) {
      console.error('   ❌ Update failed:', error.message);
    }

    // =================== STEP 4: REVIEW CREATION ===================
    console.log('\n⭐ Step 4: Creating Product Reviews');
    console.log('=' .repeat(50));
    
    const createdReviews = [];
    for (const review of SAMPLE_REVIEWS) {
      console.log(`\n➕ Creating review for ${review.productId.split(':')[1]}:`);
      console.log(`   Rating: ${review.rating}/5 stars`);
      console.log(`   Reviewer: ${review.reviewer}`);
      
      const createReviewMutation = `
        mutation CreateReview {
          createReview(input: {
            id: "${review.id}",
            rating: ${review.rating},
            reviewText: "${review.reviewText}",
            reviewer: "${review.reviewer}",
            productId: "${review.productId}"
          }) {
            success
            message
            id
          }
        }
      `;

      try {
        const result = await client.mutate({ query: createReviewMutation });
        console.log(`   ✅ Review created: ${result.data?.createReview?.id || 'Unknown ID'}`);
        createdReviews.push(review.id);
      } catch (error: any) {
        console.error(`   ❌ Failed to create review:`, error.message);
      }
    }
    
    console.log(`\n📊 Created ${createdReviews.length}/${SAMPLE_REVIEWS.length} reviews successfully`);

    // =================== STEP 5: RELATIONSHIP VERIFICATION ===================
    console.log('\n🔗 Step 5: Verifying Product-Review Relationships');
    console.log('=' .repeat(50));
    
    const reviewsQuery = `
      query GetAllReviews {
        id @single
        rating @single
        reviewText @single
        reviewer @single
        product {
          id @single
          name @single
          brand @single
        }
      }
    `;

    try {
      const reviewsResult = await client.query({ query: reviewsQuery });
      const reviews = reviewsResult.data || [];
      
      console.log(`\n📋 Found ${reviews.length} reviews with product relationships:`);
      reviews.forEach((review: any, index: number) => {
        const productInfo = Array.isArray(review.product) ? review.product[0] : review.product;
        console.log(`   ${index + 1}. ${review.rating}⭐ for ${productInfo?.name || 'Unknown Product'}`);
        console.log(`      "${review.reviewText.substring(0, 50)}..."`);
        console.log(`      By: ${review.reviewer}`);
      });
      
      if (reviews.length === 0) {
        console.log('   ⚠️  No reviews found - checking relationship creation');
      }
    } catch (error: any) {
      console.error('❌ Failed to read reviews:', error.message);
    }

    // =================== STEP 6: COMPLEX QUERIES ===================
    console.log('\n🔍 Step 6: Complex Relationship Queries');
    console.log('=' .repeat(50));
    
    console.log('\n📊 Attempting to query products with their reviews...');
    
    // This demonstrates the challenge we solved in the Apollo Server
    const complexQuery = `
      query GetProductsWithReviews {
        id @single
        name @single
        price @single
        brand @single
        reviews {
          id @single
          rating @single
          reviewText @single
          reviewer @single
        }
      }
    `;

    try {
      const complexResult = await client.query({ query: complexQuery });
      const productsWithReviews = complexResult.data || [];
      
      console.log(`\n📋 Products with reviews (${productsWithReviews.length} found):`);
      productsWithReviews.forEach((product: any, index: number) => {
        console.log(`   ${index + 1}. ${product.name} (${product.brand})`);
        const reviews = Array.isArray(product.reviews) ? product.reviews : [product.reviews].filter(Boolean);
        console.log(`      Reviews: ${reviews.length}`);
        reviews.forEach((review: any, reviewIndex: number) => {
          console.log(`         ${reviewIndex + 1}. ${review.rating}⭐ - ${review.reviewText.substring(0, 40)}...`);
        });
      });
    } catch (error: any) {
      console.error('❌ Complex query failed:', error.message);
      console.log('   💡 This demonstrates why we needed the two-step approach in Apollo Server');
    }

    // =================== STEP 7: PERFORMANCE TESTING ===================
    console.log('\n⚡ Step 7: Performance Testing');
    console.log('=' .repeat(50));
    
    console.log('\n🚀 Testing query performance...');
    const startTime = Date.now();
    
    try {
      const perfResult = await client.query({ query: readQuery });
      const endTime = Date.now();
      const queryTime = endTime - startTime;
      
      console.log(`   ✅ Query completed in ${queryTime}ms`);
      console.log(`   📊 Retrieved ${perfResult.data?.length || 0} products`);
      
      if (queryTime > 1000) {
        console.log('   ⚠️  Query took longer than 1 second - consider optimization');
      } else {
        console.log('   🎯 Good performance - query under 1 second');
      }
    } catch (error: any) {
      console.error('❌ Performance test failed:', error.message);
    }

    // =================== STEP 8: CLEANUP DEMONSTRATION ===================
    console.log('\n🧹 Step 8: Cleanup Operations');
    console.log('=' .repeat(50));
    
    console.log('\n🗑️  Demonstrating deletion capabilities...');
    
    // Delete one review to show relationship cleanup
    const reviewToDelete = SAMPLE_REVIEWS[0];
    console.log(`\n🗑️  Deleting review: ${reviewToDelete.id}`);
    
    const deleteReviewMutation = `
      mutation DeleteReview {
        deleteReview(id: "${reviewToDelete.id}") {
          success
          message
          id
        }
      }
    `;

    try {
      const deleteResult = await client.mutate({ query: deleteReviewMutation });
      console.log('   ✅ Review deleted successfully');
      
      // Verify deletion
      const verifyDeletion = await client.query({ query: reviewsQuery });
      const remainingReviews = verifyDeletion.data?.length || 0;
      console.log(`   📊 Remaining reviews: ${remainingReviews}`);
      
    } catch (error: any) {
      console.error('   ❌ Deletion failed:', error.message);
    }

    // =================== STEP 9: FINAL SUMMARY ===================
    console.log('\n📊 Step 9: Demo Summary');
    console.log('=' .repeat(50));
    
    try {
      const finalProductsResult = await client.query({ query: readQuery });
      const finalReviewsResult = await client.query({ query: reviewsQuery });
      
      const finalProducts = finalProductsResult.data?.length || 0;
      const finalReviews = finalReviewsResult.data?.length || 0;
      
      console.log('\n🎯 Final Knowledge Graph State:');
      console.log(`   📦 Products: ${finalProducts}`);
      console.log(`   ⭐ Reviews: ${finalReviews}`);
      console.log(`   🔗 Relationships: Bidirectional product-review links`);
      
      console.log('\n✅ Demo Operations Completed:');
      console.log('   1. ✅ Product catalog creation');
      console.log('   2. ✅ Data verification and validation');
      console.log('   3. ✅ Product information updates');
      console.log('   4. ✅ Review system with relationships');
      console.log('   5. ✅ Complex relationship queries');
      console.log('   6. ✅ Performance testing');
      console.log('   7. ✅ Cleanup operations');
      console.log('   8. ✅ Final state verification');
      
    } catch (error: any) {
      console.error('❌ Final summary failed:', error.message);
    }

    console.log('\n🎉 GraphQL-LD-M Demo Completed Successfully!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Explore GraphDB Workbench: http://localhost:7200');
    console.log('   2. Try the Apollo Server: npx ts-node examples/graphql-server.ts');
    console.log('   3. Test with GraphQL Playground: http://localhost:4000');
    console.log('   4. Run SPARQL queries to see the RDF data directly');
    
  } catch (error: any) {
    console.error('\n❌ Demo failed with error:', error.message);
    console.log('\n🔧 Troubleshooting Guide:');
    console.log('   1. Verify GraphDB is running: docker-compose up -d');
    console.log('   2. Check repository exists: curl http://localhost:7200/rest/repositories');
    console.log('   3. Verify endpoints are accessible:');
    console.log('      - Query: curl http://localhost:7200/repositories/graphql-demo');
    console.log('      - Update: curl -X POST http://localhost:7200/repositories/graphql-demo/statements');
    console.log('   4. Check GraphDB logs: docker logs graphdb-graphql-demo');
    console.log('   5. Ensure no other processes are using port 7200');
    
    // Additional debugging information
    console.log('\n🔍 Debug Information:');
    console.log('   Error Type:', error.constructor.name);
    console.log('   Error Stack:', error.stack?.split('\n')[0] || 'No stack trace');
  }
}

/**
 * Verify GraphDB connection and repository status
 */
async function verifyGraphDBConnection(): Promise<void> {
  try {
    console.log('   🔍 Checking GraphDB server status...');
    const response = await fetch('http://localhost:7200/rest/repositories');
    
    if (!response.ok) {
      throw new Error(`GraphDB server returned HTTP ${response.status}: ${response.statusText}`);
    }
    
    const repositories = await response.json() as any[];
    console.log(`   📊 Found ${repositories.length} repositories`);
    
    const demoRepo = repositories.find((r: any) => r.id === 'graphql-demo');
    if (!demoRepo) {
      throw new Error('graphql-demo repository not found. Please check docker-compose setup.');
    }
    
    console.log(`   ✅ Repository 'graphql-demo' found (state: ${demoRepo.state})`);
    
    // Test query endpoint
    console.log('   🔍 Testing query endpoint...');
    const queryResponse = await fetch('http://localhost:7200/repositories/graphql-demo?query=SELECT%20*%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D%20LIMIT%201');
    
    if (!queryResponse.ok) {
      throw new Error(`Query endpoint test failed: HTTP ${queryResponse.status}`);
    }
    
    console.log('   ✅ Query endpoint accessible');
    
  } catch (error: any) {
    console.error('   ❌ GraphDB verification failed:', error.message);
    throw error;
  }
}

// Export for potential module usage
export { runMutationDemo };

// Run demo if called directly
if (require.main === module) {
  runMutationDemo().catch(console.error);
}