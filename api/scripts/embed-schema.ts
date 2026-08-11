/**
 * Embeds every table doc in the schema catalog and upserts it into
 * text_to_sql_node.schema_embeddings.
 *
 * Run with:  npm run embed:schema
 * Re-run any time api/src/schema-catalog/catalog/*.json changes.
 *
 * Uses DATABASE_URL_PIPELINE (app_pipeline role — SELECT/INSERT/UPDATE on
 * schema_embeddings only), NOT DATABASE_URL (app_readonly — SELECT-only,
 * would fail here). See db/init/04-schema-embeddings.sql for the role.
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = process.env.VOYAGE_MODEL ?? 'voyage-4-lite';
const DIMENSIONS = 1024;

interface ColumnDoc {
  name: string;
  type: string;
  description: string;
  sampleValues?: string[];
}

interface TableDoc {
  tableName: string;
  description: string;
  tenantScoped: boolean;
  columns: ColumnDoc[];
}

// Duplicated from SchemaCatalogService.buildEmbeddingText on purpose: this
// script runs standalone (ts-node, no Nest DI container), and duplicating
// ~10 lines is cheaper than standing up a Nest ApplicationContext for a
// one-off CLI. If this drifts from the service version, that's a sign to
// extract both into a shared pure function in a non-Nest-specific module.
function buildEmbeddingText(table: TableDoc): string {
  const columnLines = table.columns
    .map((c) => {
      const samples = c.sampleValues?.length ? ` Examples: ${c.sampleValues.join(', ')}.` : '';
      return `- ${c.name} (${c.type}): ${c.description}.${samples}`;
    })
    .join('\n');

  return [
    `Table: ${table.tableName}`,
    `Description: ${table.description}`,
    table.tenantScoped
      ? 'This table is tenant-scoped (has a tenant_id column).'
      : 'This table is shared across tenants.',
    'Columns:',
    columnLines,
  ].join('\n');
}

async function embed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');

  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
      input_type: 'document',
      output_dimension: DIMENSIONS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function main() {
  const catalogDir = join(__dirname, '../src/schema-catalog/catalog');
  const files = readdirSync(catalogDir).filter((f) => f.endsWith('.json'));
  const tables: TableDoc[] = files.map(
    (f) => JSON.parse(readFileSync(join(catalogDir, f), 'utf-8')) as TableDoc,
  );

  console.log(`Embedding ${tables.length} table docs with model ${MODEL}...`);

  const docTexts = tables.map(buildEmbeddingText);
  const vectors = await embed(docTexts);

  const connectionString = process.env.DATABASE_URL_PIPELINE;
  if (!connectionString) throw new Error('DATABASE_URL_PIPELINE is not set');
  const pool = new Pool({ connectionString });

  try {
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const vectorLiteral = `[${vectors[i].join(',')}]`;
      await pool.query(
        `INSERT INTO text_to_sql_node.schema_embeddings (table_name, doc_text, embedding, updated_at)
         VALUES ($1, $2, $3::vector, now())
         ON CONFLICT (table_name)
         DO UPDATE SET doc_text = EXCLUDED.doc_text, embedding = EXCLUDED.embedding, updated_at = now()`,
        [table.tableName, docTexts[i], vectorLiteral],
      );
      console.log(`  \u2713 ${table.tableName}`);
    }
  } finally {
    await pool.end();
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});