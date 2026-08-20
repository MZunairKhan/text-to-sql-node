import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { SchemaRetrievalService } from './schema-retrieval.service';

class RetrieveSchemaDto {
  query: string;
  topK?: number;
  /** Foreign-key neighbour expansion; on by default, send false to disable. */
  expand?: boolean;
}

/**
 * Internal-only endpoint for Phase 1 manual verification and the
 * evals/phase1 script. Not part of the public pipeline — in Phase 2,
 * SqlGenerationService calls SchemaRetrievalService directly (in-process),
 * it doesn't go over HTTP. Consider removing or gating this controller
 * behind a dev-only flag once Phase 2 lands.
 */
@Controller('schema-retrieval')
export class SchemaRetrievalController {
  constructor(private readonly schemaRetrieval: SchemaRetrievalService) {}

  @Post('query')
  async query(@Body() dto: RetrieveSchemaDto) {
    const query = typeof dto?.query === 'string' ? dto.query.trim() : '';
    if (!query) {
      throw new BadRequestException('`query` must be a non-empty string');
    }
    // topK feeds a parameterized LIMIT, so this is not an injection risk,
    // but unclamped values would error out or dump the whole table.
    const requested = Number(dto.topK);
    const topK = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 10) : 3;
    const tables = await this.schemaRetrieval.retrieveRelevantTables(query, topK, {
      expand: dto.expand !== false,
    });
    return { query, topK, tables };
  }
}
