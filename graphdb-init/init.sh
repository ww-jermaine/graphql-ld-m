#!/bin/bash

# Wait for GraphDB to be ready
until curl -f "http://localhost:7200/rest/repositories" > /dev/null 2>&1; do
    echo "Waiting for GraphDB..."
    sleep 5
done

# Create repository
curl -X POST \
    -H "Content-Type: multipart/form-data" \
    -F "config=@/root/graphdb-import/graphql-demo-config.ttl" \
    "http://localhost:7200/rest/repositories"

echo "Repository created successfully" 