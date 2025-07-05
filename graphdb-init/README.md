# GraphDB Initialization

This directory contains the initialization files for GraphDB. The following files are used to set up the GraphDB instance:

## Files

- `init.sh`: Initialization script that creates the repository
- `graphql-demo-config.ttl`: Repository configuration file in Turtle format
- `README.md`: This documentation file

## Repository Configuration

The `graphql-demo` repository is configured with the following settings:

- **Repository Type**: Free (GraphDB Free Edition)
- **Ruleset**: OWL-Horst for basic reasoning capabilities
- **Entity Index Size**: 10M entities
- **Cache Memory**: 80MB
- **Features**:
  - Context indexing enabled
  - Predicate list enabled
  - Literal indexing enabled
  - 32-bit entity IDs

## Initialization Process

1. The `init.sh` script waits for GraphDB to be ready
2. Once GraphDB is available, it creates the repository using the configuration file
3. The script is automatically executed when the container starts

## Usage

The repository will be automatically created when you start the Docker containers:

```bash
docker-compose up -d
```

You can access:
- GraphDB Workbench: http://localhost:7200
- Repository endpoint: http://localhost:7200/repositories/graphql-demo

## Verification

To verify the repository creation:

```bash
curl http://localhost:7200/rest/repositories
```

This should list the `graphql-demo` repository in the response. 