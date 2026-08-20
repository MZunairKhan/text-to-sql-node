import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TableDoc } from './schema-catalog.types';

export interface ExpandedTable {
  tableName: string;
  /**
   * bridge    - joins two or more similarity hits (e.g. orders between
   *             revenue_centers and order_items)
   * fk-parent - referenced by a similarity hit, so needed to resolve names
   */
  reason: 'bridge' | 'fk-parent';
}

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
  private readonly logger = new Logger(SchemaCatalogService.name);
  /** table -> tables it references via foreign keys */
  private readonly fkParents = new Map<string, Set<string>>();
  /** table -> tables that reference it via foreign keys */
  private readonly fkChildren = new Map<string, Set<string>>();

  constructor() {
    const files = readdirSync(this.catalogDir).filter((f) => f.endsWith('.json'));
    this.tables = files.map(
      (f) => JSON.parse(readFileSync(join(this.catalogDir, f), 'utf-8')) as TableDoc,
    );
    this.buildForeignKeyGraph();
  }

  getAllTables(): TableDoc[] {
    return this.tables;
  }

  getTableByName(name: string): TableDoc | undefined {
    return this.tables.find((t) => t.tableName === name);
  }

  /**
   * Foreign-key neighbour expansion. Similarity search finds the tables a
   * query is *about*, but SQL generation also needs the tables that join
   * them. Given the similarity hits, returns extra tables, bridges first:
   *
   *  1. bridge:    any non-seed table adjacent (either direction) to 2+ seeds
   *  2. fk-parent: tables the seeds reference via foreign keys
   *
   * Deliberately NOT included: child tables (inbound FKs) that connect to
   * only one seed. Following those fans out quickly (products -> order_items
   * -> orders -> ...), and a child is rarely needed unless something else
   * in the query points at it, which is what the bridge rule covers.
   */
  expandWithForeignKeys(seedNames: string[], maxExtra = 3): ExpandedTable[] {
    const seeds = new Set(seedNames.filter((n) => this.fkParents.has(n)));
    const neighbours = (t: string): Set<string> =>
      new Set([...(this.fkParents.get(t) ?? []), ...(this.fkChildren.get(t) ?? [])]);

    const extras: ExpandedTable[] = [...this.fkParents.keys()]
      .filter((t) => !seeds.has(t))
      .map((t) => ({ t, hits: [...neighbours(t)].filter((n) => seeds.has(n)).length }))
      .filter((b) => b.hits >= 2)
      .sort((a, b) => b.hits - a.hits)
      .map((b) => ({ tableName: b.t, reason: 'bridge' as const }));

    const taken = new Set<string>([...seeds, ...extras.map((e) => e.tableName)]);
    for (const seed of seedNames) {
      for (const parent of this.fkParents.get(seed) ?? []) {
        if (taken.has(parent)) continue;
        taken.add(parent);
        extras.push({ tableName: parent, reason: 'fk-parent' });
      }
    }
    return extras.slice(0, maxExtra);
  }

  private buildForeignKeyGraph(): void {
    for (const t of this.tables) {
      this.fkParents.set(t.tableName, new Set());
      this.fkChildren.set(t.tableName, new Set());
    }
    for (const t of this.tables) {
      for (const c of t.columns) {
        if (!c.isForeignKey) continue;
        const parent = c.isForeignKey.split('.')[0];
        if (parent === t.tableName) continue; // self-reference adds no join path
        if (!this.fkParents.has(parent)) {
          this.logger.warn(`${t.tableName}.${c.name} references unknown table '${parent}'`);
          continue;
        }
        this.fkParents.get(t.tableName)!.add(parent);
        this.fkChildren.get(parent)!.add(t.tableName);
      }
    }
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
