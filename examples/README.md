# GraphQL-LD-M Examples

This directory contains demonstration implementations that showcase the key research contributions of GraphQL-LD-M. Each example is designed to illustrate specific aspects of the mutation extension framework and its practical applications in Knowledge Graph manipulation.

## Research Demonstration Cases

### 1. GraphQL Server Implementation (`graphql-server.ts`)

A complete GraphQL server implementation demonstrating the bidirectional transformation capabilities of GraphQL-LD-M.

**Key Research Aspects Demonstrated:**
- Mutation to SPARQL UPDATE transformation
- Type-safe GraphQL schema generation
- JSON-LD context resolution
- Semantic validation during mutations

**Features:**
- Full CRUD operations for Products and Reviews
- Real-time GraphQL mutations with SPARQL backend
- Automated SPARQL query generation
- Built-in documentation and examples

**Usage:**
```bash
npm run build
node dist/examples/graphql-server.js
```

**Access Points:**
- GraphQL Endpoint: http://localhost:4000/
- Interactive Playground: http://localhost:4000/

### 2. Mutation Demonstration (`mutation-demo.ts`)

A focused demonstration of the mutation extension framework, showing the transformation pipeline from GraphQL mutations to SPARQL updates.

**Key Research Aspects Demonstrated:**
- Mutation pattern implementations
- SPARQL update generation
- Transaction handling
- Error recovery mechanisms

**Usage:**
```bash
npm run build
node dist/examples/mutation-demo.js
```

## Technical Prerequisites

### 1. GraphDB Configuration

GraphDB serves as the RDF store for our examples. The system uses different endpoints for specific operations:

#### Query Endpoint (SPARQL SELECT)
- **URL**: `http://localhost:7200/repositories/graphql-demo`
- **Purpose**: Read operations (SELECT queries)
- **Method**: GET/POST

#### Update Endpoint (SPARQL UPDATE)
- **URL**: `http://localhost:7200/repositories/graphql-demo/statements`
- **Purpose**: Write operations (INSERT/UPDATE/DELETE)
- **Method**: POST

### 2. Environment Setup

```bash
# Start GraphDB instance
docker-compose up -d

# Verify repository availability
curl http://localhost:7200/rest/repositories

# Install dependencies
npm install
```

## Implementation Patterns

### 1. Query Patterns

The examples demonstrate various GraphQL-LD query patterns and their SPARQL equivalents:

```graphql
# Direct field query (recommended)
{
  name
  price
}

# Type-based query with fragment
{
  ... on Product {
    id
    name
  }
}

# Field query with constraints
{
  name(id: "product:1")
}
```

### 2. Mutation Patterns

Examples of supported mutation patterns:

```graphql
# Create operation
mutation {
  createProduct(input: {
    name: "Example Product"
    price: 99.99
  }) {
    id
  }
}

# Update operation
mutation {
  updateProduct(id: "product:1", input: {
    price: 79.99
  }) {
    success
  }
}

# Delete operation
mutation {
  deleteProduct(id: "product:1") {
    success
  }
}
```

## Validation & Verification

### 1. GraphDB Data Inspection

Access GraphDB Workbench to verify transformations:

1. Open: http://localhost:7200
2. Select: graphql-demo repository
3. Execute SPARQL queries:

```sparql
# Verify product creation
SELECT ?s ?p ?o WHERE {
  ?s ?p ?o .
  FILTER(CONTAINS(STR(?s), "product:"))
}

# Verify product details
SELECT ?name ?price WHERE {
  <http://example.org/product:1> 
    <https://schema.org/name> ?name ;
    <https://schema.org/price> ?price .
}
```

### 2. System Verification

```bash
# Verify GraphDB status
docker ps | grep graphdb

# Check GraphDB logs
docker logs graphdb-graphql-demo

# Test endpoints
curl http://localhost:7200/repositories/graphql-demo
```

## Research Extensions

When implementing new examples:

1. **Follow the Endpoint Pattern**:
   ```typescript
   const queryEndpoint = 'http://localhost:7200/repositories/graphql-demo';
   const updateEndpoint = 'http://localhost:7200/repositories/graphql-demo/statements';
   ```

2. **Implement Error Handling**:
   ```typescript
   try {
     const result = await client.mutate({ query });
     // Handle success
   } catch (error) {
     // Handle specific error types
   }
   ```

3. **Document GraphQL-LD Patterns** used in the implementation

4. **Update Documentation** with new research findings

## Citation

If you use these examples in your research, please cite:

```bibtex
@software{graphql_ld_m_examples,
  title = {GraphQL-LD-M: Implementation Examples},
  year = {2024},
  url = {https://github.com/yourusername/graphql-ld-m/tree/main/examples}
}
```