import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { Client, QueryEngineSparqlEndpoint } from "../src/index";

// GraphQL Schema Definition
const typeDefs = `#graphql
  type Product {
    id: ID!
    name: String!
    description: String
    price: Float!
    currency: String
    brand: String
    reviews: [Review!]
  }

  type Review {
    id: ID!
    rating: Int!
    reviewText: String!
    reviewer: String!
    product: Product
  }

  type MutationResult {
    success: Boolean!
    message: String
    id: String
  }

  input ProductInput {
    id: ID
    name: String!
    description: String
    price: Float!
    currency: String
    brand: String
  }

  input ProductUpdateInput {
    name: String
    description: String
    price: Float
    currency: String
    brand: String
  }

  input ReviewInput {
    id: ID
    rating: Int!
    reviewText: String!
    reviewer: String!
    productId: ID
  }

  type Query {
    # Query all products
    products: [Product!]!
    
    # Query product by ID
    product(id: ID!): Product
    
    # Query all reviews
    reviews: [Review!]!
    
    # Health check
    health: String!
  }

  type Mutation {
    # Product mutations
    createProduct(input: ProductInput!): MutationResult!
    updateProduct(id: ID!, input: ProductUpdateInput!): MutationResult!
    deleteProduct(id: ID!): MutationResult!
    
    # Review mutations
    createReview(input: ReviewInput!): MutationResult!
    deleteReview(id: ID!): MutationResult!
  }
`;

// JSON-LD Context for Schema.org Products
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
    'name': 'schema:name',
    'description': 'schema:description',
    'price': { '@id': 'schema:price', '@type': 'xsd:decimal' },
    'currency': 'schema:priceCurrency',
    'brand': 'schema:brand',
    'rating': { '@id': 'schema:ratingValue', '@type': 'xsd:integer' },
    'reviewText': 'schema:reviewBody',
    'reviewer': 'schema:author',
    
    // Add relationship properties for proper linking
    'reviews': { 
      '@id': 'schema:review', 
      '@type': '@id',
      '@container': '@set'
    },
    'product': { 
      '@id': 'schema:itemReviewed', 
      '@type': '@id' 
    },
    'hasReview': { 
      '@id': 'schema:review', 
      '@type': '@id',
      '@container': '@set'
    },
    'reviewOf': { 
      '@id': 'schema:itemReviewed', 
      '@type': '@id' 
    }
  },
};

// Initialize GraphQL-LD Client
const queryEndpoint = 'http://localhost:7200/repositories/graphql-demo';
const updateEndpoint = 'http://localhost:7200/repositories/graphql-demo/statements';

const client = new Client({ 
  context, 
  queryEngine: new QueryEngineSparqlEndpoint(queryEndpoint, updateEndpoint) 
});

// GraphQL Resolvers
const resolvers = {
  Query: {
    health: () => "GraphQL-LD Mutation Server is running! 🚀",
    
    products: async () => {
      try {
        // First, get all products without reviews
        const query = `
          query GetAllProducts {
            id @single
            name @single
            description @single
            price @single
            currency @single
            brand @single
          }
        `;
        
        const result = await client.query({ query });
        
        if (result.data && Array.isArray(result.data)) {
          // Get all products first
          const products = result.data.map((item: any) => ({
            id: item.id || '',
            name: Array.isArray(item.name) ? item.name[0] : item.name || '',
            description: Array.isArray(item.description) ? item.description[0] : item.description || '',
            price: Array.isArray(item.price) ? parseFloat(item.price[0]) : parseFloat(item.price) || 0,
            currency: Array.isArray(item.currency) ? item.currency[0] : item.currency || 'USD',
            brand: Array.isArray(item.brand) ? item.brand[0] : item.brand || '',
            reviews: [] as any[]
          }));
          
          // Then get reviews and match them to products
          try {
            const reviewsQuery = `
              query GetAllReviews {
                id @single
                rating @single
                reviewText @single
                reviewer @single
                product {
                  id @single
                }
              }
            `;
            
            const reviewsResult = await client.query({ query: reviewsQuery });
            
            if (reviewsResult.data && Array.isArray(reviewsResult.data)) {
              // Group reviews by product ID
              const reviewsByProduct: { [key: string]: any[] } = {};
              
              reviewsResult.data.forEach((review: any) => {
                if (review.product && Array.isArray(review.product) && review.product.length > 0) {
                  const productId = review.product[0].id;
                  if (!reviewsByProduct[productId]) {
                    reviewsByProduct[productId] = [];
                  }
                  reviewsByProduct[productId].push({
                    id: review.id || '',
                    rating: parseInt(review.rating) || 0,
                    reviewText: review.reviewText || '',
                    reviewer: review.reviewer || ''
                  });
                }
              });
              
              // Attach reviews to products
              products.forEach(product => {
                if (reviewsByProduct[product.id]) {
                  product.reviews = reviewsByProduct[product.id];
                }
              });
            }
          } catch (reviewError) {
            console.error('Error fetching reviews:', reviewError);
            // Continue without reviews
          }
          
          return products;
        }
        
        return [];
      } catch (error) {
        console.error('Query products error:', error);
        return [];
      }
    },

    product: async (_: any, { id }: { id: string }) => {
      try {
        const query = `
          query GetAllProducts {
            id @single
            name @single
            description @single
            price @single
            currency @single
            brand @single
            reviews {
              id @single
              rating @single
              reviewText @single
              reviewer @single
            }
          }
        `;
        
        const result = await client.query({ query });
        
        if (result.data && Array.isArray(result.data)) {
          const fullId = id.startsWith('http://') ? id : `http://example.org/${id}`;
          const item = result.data.find((p: any) => p.id === fullId);
          
          if (item) {
            return {
              id: id,
              name: item.name || '',
              description: item.description || '',
              price: parseFloat(item.price) || 0,
              currency: item.currency || 'USD',
              brand: item.brand || '',
              reviews: Array.isArray(item.reviews) ? item.reviews.map((review: any) => ({
                id: review.id || '',
                rating: parseInt(review.rating) || 0,
                reviewText: review.reviewText || '',
                reviewer: review.reviewer || ''
              })) : []
            };
          }
        }
        
        return null;
      } catch (error) {
        console.error('Query product error:', error);
        return null;
      }
    },

    reviews: async () => {
      try {
        const query = `
          query GetAllReviews {
            id @single
            rating @single
            reviewText @single
            reviewer @single
            product {
              id @single
              name @single
              description @single
              price @single
              currency @single
              brand @single
            }
          }
        `;
        
        const result = await client.query({ query });
        
        if (result.data && Array.isArray(result.data)) {
          return result.data.map((item: any) => ({
            id: item.id || '',
            rating: parseInt(item.rating) || 0,
            reviewText: item.reviewText || '',
            reviewer: item.reviewer || '',
            product: item.product && Array.isArray(item.product) && item.product.length > 0 ? {
              id: item.product[0].id || '',
              name: item.product[0].name || '',
              description: item.product[0].description || '',
              price: parseFloat(item.product[0].price) || 0,
              currency: item.product[0].currency || 'USD',
              brand: item.product[0].brand || ''
            } : null
          }));
        }
        
        return [];
      } catch (error) {
        console.error('Query reviews error:', error);
        return [];
      }
    }
  },

  Mutation: {
    createProduct: async (_: any, { input }: { input: any }) => {
      try {
        // Generate ID if not provided
        const productId = input.id || `product:${Date.now()}`;
        // Don't add base URL - it's handled by the JSON-LD context
        
        const mutation = `
          mutation CreateProduct {
            createProduct(input: {
              id: "${productId}",
              name: "${input.name}",
              description: "${input.description || ''}",
              price: ${input.price},
              currency: "${input.currency || 'USD'}",
              brand: "${input.brand || ''}"
            }) {
              id
            }
          }
        `;
        
        const result = await client.mutate({ query: mutation });
        
        if (result.data?.['mutate']?.['success']) {
          return {
            success: true,
            message: "Product created successfully",
            id: productId // Return original ID format
          };
        } else {
          return {
            success: false,
            message: result.errors?.[0]?.message || "Failed to create product"
          };
        }
      } catch (error) {
        console.error('Create product error:', error);
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    },

    updateProduct: async (_: any, { id, input }: { id: string, input: any }) => {
      try {
        // Don't add base URL - it's handled by the JSON-LD context
        const mutation = `
          mutation UpdateProduct {
            updateProduct(id: "${id}", input: {
              ${Object.entries(input)
                .filter(([_, value]) => value !== undefined && value !== null)
                .map(([key, value]) => typeof value === 'string' ? `${key}: "${value}"` : `${key}: ${value}`)
                .join(', ')}
            }) {
              id
            }
          }
        `;
        
        const result = await client.mutate({ query: mutation });
        
        if (result.data?.['mutate']?.['success']) {
          return {
            success: true,
            message: "Product updated successfully",
            id // Return original ID format
          };
        } else {
          return {
            success: false,
            message: result.errors?.[0]?.message || "Failed to update product"
          };
        }
      } catch (error) {
        console.error('Update product error:', error);
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    },

    deleteProduct: async (_: any, { id }: { id: string }) => {
      try {
        // Don't add base URL - it's handled by the JSON-LD context
        const mutation = `
          mutation DeleteProduct {
            deleteProduct(id: "${id}") {
              id
            }
          }
        `;
        
        const result = await client.mutate({ query: mutation });
        
        if (result.data?.['mutate']?.['success']) {
          return {
            success: true,
            message: "Product deleted successfully",
            id // Return original ID format
          };
        } else {
          return {
            success: false,
            message: result.errors?.[0]?.message || "Failed to delete product"
          };
        }
      } catch (error) {
        console.error('Delete product error:', error);
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    },

    createReview: async (_: any, { input }: { input: any }) => {
      try {
        // Generate ID if not provided
        const reviewId = input.id || `review:${Date.now()}`;
        // Don't add base URL - it's handled by the JSON-LD context
        
        const mutation = `
          mutation CreateReview {
            createReview(input: {
              id: "${reviewId}",
              rating: ${input.rating},
              reviewText: "${input.reviewText}",
              reviewer: "${input.reviewer}"
              ${input.productId ? `,product: "${input.productId}"` : ''}
            }) {
              id
            }
          }
        `;
        
        const result = await client.mutate({ query: mutation });
        
        if (result.data?.['mutate']?.['success']) {
          return {
            success: true,
            message: "Review created successfully",
            id: reviewId // Return original ID format
          };
        } else {
          return {
            success: false,
            message: result.errors?.[0]?.message || "Failed to create review"
          };
        }
      } catch (error) {
        console.error('Create review error:', error);
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    },

    deleteReview: async (_: any, { id }: { id: string }) => {
      try {
        // Don't add base URL - it's handled by the JSON-LD context
        const mutation = `
          mutation DeleteReview {
            deleteReview(id: "${id}") {
              id
            }
          }
        `;
        
        const result = await client.mutate({ query: mutation });
        
        if (result.data?.['mutate']?.['success']) {
          return {
            success: true,
            message: "Review deleted successfully",
            id // Return original ID format
          };
        } else {
          return {
            success: false,
            message: result.errors?.[0]?.message || "Failed to delete review"
          };
        }
      } catch (error) {
        console.error('Delete review error:', error);
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  }
};

// Create Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Enable GraphQL Playground for easy testing
  introspection: true,
});

// Start the server
async function startServer() {
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
  });

  console.log(`🚀 GraphQL-LD Mutation Server ready at: ${url}`);
  console.log(`📊 GraphQL Playground available at: ${url}`);
  console.log(`🧪 Test with Insomnia using endpoint: ${url}`);
  console.log(`\n=== 📝 PRODUCT CRUD EXAMPLES ===\n`);
  
  console.log(`📖 READ - Get all products with their reviews:`);
  console.log(`query {
  products {
    id
    name
    description
    price
    currency
    brand
    reviews {
      id
      rating
      reviewText
      reviewer
    }
  }
}\n`);

  console.log(`➕ CREATE - Add new product:`);
  console.log(`mutation {
  createProduct(input: {
    name: "MacBook Pro"
    description: "Latest MacBook Pro with M3 chip"
    price: 2499.99
    currency: "USD"
    brand: "Apple"
  }) {
    success
    message
    id
  }
}\n`);

  console.log(`📖 READ - Get specific product with reviews:`);
  console.log(`query {
  product(id: "product:<id generated by the server>") {
    id
    name
    description
    price
    currency
    brand
    reviews {
      id
      rating
      reviewText
      reviewer
    }
  }
  }\n`);

  console.log(`✏️ UPDATE - Modify product:`);
  console.log(`mutation {
  updateProduct(id: "product:<id generated by the server>", input: {
    price: 1099.99
    description: "Updated gaming laptop with RTX 4080"
  }) {
    success
    message
    id
  }
}\n`);

  console.log(`🗑️ DELETE - Remove product:`);
  console.log(`mutation {
  deleteProduct(id: "product:<id generated by the server>") {
    success
    message
    id
    <include the fields you want to delete>
  }
}\n`);

  console.log(`=== 📝 REVIEW CRUD EXAMPLES ===\n`);
  
  console.log(`📖 READ - Get all reviews with their products:`);
  console.log(`query {
  reviews {
    id
    rating
    reviewText
    reviewer
    product {
      id
      name
      description
      price
      currency
      brand
    }
  }
}\n`);

  console.log(`➕ CREATE - Add new review (linked to a product):`);
  console.log(`mutation {
  createReview(input: {
    rating: 5
    reviewText: "Excellent product! Highly recommended."
    reviewer: "john@example.com"
    productId: "product:<id generated by the server>"
  }) {
    success
    message
    id
  }
}\n`);

  console.log(`🗑️ DELETE - Remove review:`);
  console.log(`mutation {
  deleteReview(id: "review_123") {
    success
    message
    id
  }
}\n`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down GraphQL server...');
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

export { server, startServer };