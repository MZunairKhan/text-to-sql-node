import { Body, Controller, Post } from '@nestjs/common';
import { SchemaRetrievalService } from './schema-retrieval.service';

class RetrieveSchemaDto {
  query: string;
  topK?: number;
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
    const topK = dto.topK ?? 3;
    const tables = await this.schemaRetrieval.retrieveRelevantTables(dto.query, topK);
    return { query: dto.query, topK, tables };
  }
}
