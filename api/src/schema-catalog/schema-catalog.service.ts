import { Injectable } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TableDoc } from './schema-catalog.types';

/**
 * Loads the table-doc catalog (api/src/schema-catalog/catalog/*.json) and
 * exposes it both as structured data (for the DDL that gets injected into
 * the SQL-generation prompt in Phase 2) and as flattened text (for the
 * embedding pipeline).
 *
 * NOTE (build config): the *.json files under ./catalog must be copied into
 * dist/ on build, since readdirSync/readFileSync run against the compiled
 * output at runtime. Add to nest-cli.json:
 *   "compilerOptions": { "assets": ["schema-catalog/catalog/**\/*.json"], "watchAssets": true }
 */
@Injectable()
export class SchemaCatalogService {
  private readonly catalogDir = join(__dirname, 'catalog');
  private readonly tables: TableDoc[];

  constructor() {
    const files = readdirSync(this.catalogDir).filter((f) => f.endsWith('.json'));
    this.tables = files.map(
      (f) => JSON.parse(readFileSync(join(this.catalogDir, f), 'utf-8')) as TableDoc,
    );
  }

  getAllTables(): TableDoc[] {
    return this.tables;
  }

  getTableByName(name: string): TableDoc | undefined {
    return this.tables.find((t) => t.tableName === name);
  }

  /**
   * Flattens a table doc into the text blob that gets embedded.
   *
   * Column names, descriptions, and sample values are front-loaded because
   * they carry more retrieval-relevant semantic signal than the raw DDL
   * (a query like "top revenue centers" needs to match against words like
   * "region" and "opened" more than against `UUID NOT NULL DEFAULT`). The
   * tenant-scoping line is included deliberately: it costs nothing here and
   * means the doc corpus is already annotated for when Phase 3 needs to
   * reason about which tables require a tenant_id predicate.
   */
  buildEmbeddingText(table: TableDoc): string {
    const columnLines = table.columns
      .map((c) => {
        const samples = c.sampleValues?.length
          ? ` Examples: ${c.sampleValues.join(', ')}.`
          : '';
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
}
