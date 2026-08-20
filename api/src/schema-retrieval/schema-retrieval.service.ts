import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { EMBEDDING_PROVIDER } from '../embeddings/embeddings.module';
import { SchemaCatalogService } from '../schema-catalog/schema-catalog.service';
import type { EmbeddingProvider } from '../embeddings/embedding-provider.interface';

export interface RetrievedTable {
  tableName: string;
  ddl: string;
  description: string;
  tenantScoped: boolean;
  /** 1 - cosine_distance; higher is more similar. Null for FK-expanded tables. */
  similarity: number | null;
  /** How the table got in: similarity search, or foreign-key expansion. */
  source: 'similarity' | 'bridge' | 'fk-parent';
}

interface SchemaEmbeddingRow {
  table_name: string;
  distance: number;
}

@Injectable()
export class SchemaRetrievalService implements OnModuleDestroy {
  // Reads DATABASE_URL — the same app_readonly connection string used for
  // executing generated SQL in later phases. That's fine here: this query
  // is fixed, written by us, not LLM output, so it doesn't need to go
  // through the AST guardrail. It DOES need app_readonly (or better) to
  // have SELECT on schema_embeddings — see db/init/04-schema-embeddings.sh.
  //
  // If Phase 0 already wired up a shared Pool/DataSource elsewhere in the
  // app, inject that instead of creating a second one here.
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });
  private readonly logger = new Logger(SchemaRetrievalService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly catalog: SchemaCatalogService,
  ) {
    // Without a listener, an idle-client error (e.g. Postgres restarting)
    // is an unhandled 'error' event and takes the whole process down.
    this.pool.on('error', (err) => this.logger.error(`Idle pg client error: ${err.message}`));
  }

  /**
   * topK bounds the similarity hits only. With expand (default on), up to
   * maxExpanded foreign-key neighbours are appended after them, tagged via
   * `source` so retrieval quality can still be evaluated on similarity alone.
   */
  async retrieveRelevantTables(
    query: string,
    topK = 3,
    options: { expand?: boolean; maxExpanded?: number } = {},
  ): Promise<RetrievedTable[]> {
    const [queryEmbedding] = await this.embeddings.embed([query], 'query');

    // <=> is pgvector's cosine-distance operator; requires the
    // vector_cosine_ops index created in db/init to be fast, but is
    // correct without it too (just a seq scan) — fine at this table count.
    const { rows } = await this.pool.query<SchemaEmbeddingRow>(
      `SELECT table_name, embedding <=> $1::vector AS distance
       FROM text_to_sql_node.schema_embeddings
       ORDER BY distance ASC
       LIMIT $2`,
      [this.toVectorLiteral(queryEmbedding), topK],
    );

    const result = rows
      .map((row) => {
        const table = this.catalog.getTableByName(row.table_name);
        if (!table) return null; // stale embedding row for a removed table
        return {
          tableName: table.tableName,
          ddl: table.ddl,
          description: table.description,
          tenantScoped: table.tenantScoped,
          similarity: 1 - row.distance,
          source: 'similarity' as const,
        };
      })
      .filter((t): t is RetrievedTable => t !== null);

    if (options.expand ?? true) {
      const extras = this.catalog.expandWithForeignKeys(
        result.map((t) => t.tableName),
        options.maxExpanded ?? 3,
      );
      for (const extra of extras) {
        const table = this.catalog.getTableByName(extra.tableName);
        if (!table) continue;
        result.push({
          tableName: table.tableName,
          ddl: table.ddl,
          description: table.description,
          tenantScoped: table.tenantScoped,
          similarity: null,
          source: extra.reason,
        });
      }
    }

    // Per-query retrieval log (execution plan, Phase 1): feeds later
    // retrieval-quality evals and, in Phase 5, the request trace.
    this.logger.log(
      JSON.stringify({
        query,
        topK,
        retrieved: result.map((t) => ({
          table: t.tableName,
          source: t.source,
          similarity: t.similarity === null ? null : Number(t.similarity.toFixed(4)),
        })),
      }),
    );
    return result;
  }

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
