#!/bin/bash
# Runs automatically on first container start (docker-entrypoint-initdb.d).
# Creates the pgvector table backing SchemaRetrievalService's similarity
# search, plus a narrow app_pipeline role for the embedding pipeline
# script (api/scripts/embed-schema.ts).
#
# This is a .sh (not .sql) specifically because it needs
# ${APP_PIPELINE_PASSWORD} shell-substituted into the heredoc — plain .sql
# files under docker-entrypoint-initdb.d run via `psql -f`, which does NOT
# do env-var substitution, so the same pattern 01-init.sh already uses.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE TABLE IF NOT EXISTS text_to_sql_node.schema_embeddings (
    table_name TEXT PRIMARY KEY,
    doc_text TEXT NOT NULL,
    embedding VECTOR(1024) NOT NULL, -- must match VoyageEmbeddingProvider.dimensions
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS schema_embeddings_embedding_idx
    ON text_to_sql_node.schema_embeddings
    USING hnsw (embedding vector_cosine_ops);

  DO
  \$do\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_pipeline') THEN
      CREATE ROLE app_pipeline WITH LOGIN PASSWORD '${APP_PIPELINE_PASSWORD}';
    END IF;
  END
  \$do\$;

  -- Least privilege: app_pipeline can write to schema_embeddings only,
  -- nothing else. app_readonly already gets SELECT on it for free via
  -- 01-init.sh's ALTER DEFAULT PRIVILEGES (schema-wide, all future tables) —
  -- no additional grant needed here.
  GRANT USAGE ON SCHEMA text_to_sql_node TO app_pipeline;
  GRANT SELECT, INSERT, UPDATE ON text_to_sql_node.schema_embeddings TO app_pipeline;
  ALTER ROLE app_pipeline SET search_path = text_to_sql_node, public;
EOSQL
