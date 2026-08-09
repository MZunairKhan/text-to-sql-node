#!/bin/bash
# Runs automatically on first container start (docker-entrypoint-initdb.d).
# Creates the application schema, enables pgvector, and provisions the
# least-privilege app_readonly role that the API connects as.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE SCHEMA IF NOT EXISTS text_to_sql_node;

  DO
  \$do\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_readonly') THEN
      CREATE ROLE app_readonly WITH LOGIN PASSWORD '${APP_READONLY_PASSWORD}';
    END IF;
  END
  \$do\$;

  GRANT USAGE ON SCHEMA text_to_sql_node TO app_readonly;
  GRANT SELECT ON ALL TABLES IN SCHEMA text_to_sql_node TO app_readonly;
  ALTER DEFAULT PRIVILEGES IN SCHEMA text_to_sql_node GRANT SELECT ON TABLES TO app_readonly;
  ALTER ROLE app_readonly SET search_path = text_to_sql_node, public;

  -- Defense in depth: cap how long any query on this role can run.
  -- Phase 3 will tune this further with per-query cost checks.
  ALTER ROLE app_readonly SET statement_timeout = '5s';
EOSQL
