import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { EMBEDDING_PROVIDER } from '../embeddings/embeddings.module';
import { SchemaCatalogService } from '../schema-catalog/schema-catalog.service';
import * as embeddingProviderInterface from 'src/embeddings/embedding-provider.interface';

export interface RetrievedTable {
  tableName: string;
  ddl: string;
  description: string;
  tenantScoped: boolean;
  /** 1 - cosine_distance; higher is more similar. */
  similarity: number;
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
  // have SELECT on schema_embeddings — see db/init/03-schema-embeddings.sql.
  //
  // If Phase 0 already wired up a shared Pool/DataSource elsewhere in the
  // app, inject that instead of creating a second one here.
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: embeddingProviderInterface.EmbeddingProvider,
    private readonly catalog: SchemaCatalogService,
  ) {}

  async retrieveRelevantTables(query: string, topK = 3): Promise<RetrievedTable[]> {
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

    return rows
      .map((row) => {
        const table = this.catalog.getTableByName(row.table_name);
        if (!table) return null; // stale embedding row for a removed table
        return {
          tableName: table.tableName,
          ddl: table.ddl,
          description: table.description,
          tenantScoped: table.tenantScoped,
          similarity: 1 - row.distance,
        };
      })
      .filter((t): t is RetrievedTable => t !== null);
  }

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
