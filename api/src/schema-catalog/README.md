# Schema catalog format

One JSON file per table in `./catalog/`, matching `TableDoc` in
`schema-catalog.types.ts`:

```json
{
  "tableName": "orders",
  "schema": "text_to_sql_node",
  "description": "...",
  "tenantScoped": true,
  "columns": [
    { "name": "id", "type": "uuid", "description": "...", "isPrimaryKey": true },
    { "name": "customer_id", "type": "uuid", "description": "...", "isForeignKey": "customers.id" }
  ],
  "ddl": "CREATE TABLE text_to_sql_node.orders (...);"
}
```

## Why JSON files instead of introspecting Postgres directly

`information_schema` would give you column names and types for free, but
not the two things that actually drive retrieval and generation quality:
human-written descriptions and representative sample values. A column
named `status` with no description embeds and prompts far worse than one
annotated "Order lifecycle status. Examples: pending, fulfilled, refunded,
cancelled." Hand-authoring the catalog is the cost of that signal.

## Two consumers of the same doc, different formatting

- **`ddl`** — injected into the Phase 2 SQL-generation prompt verbatim.
  Needs to be valid, parseable SQL.
- **`buildEmbeddingText()`** (in `schema-catalog.service.ts`) — flattens
  the doc into prose for embedding. Deliberately *not* the same string as
  `ddl`: column descriptions and sample values carry more retrieval signal
  than SQL syntax tokens do, so they're front-loaded and the type/DDL
  info is secondary.

## Adding a table

1. Add a new `<table_name>.json` to `./catalog/`.
2. Add the matching `CREATE TABLE` (+ grants) to `db/init/`.
3. Re-run `npm run embed:schema` to pick it up — the catalog service reads
   the JSON directory at boot, but the embeddings table only updates when
   the pipeline script runs.
