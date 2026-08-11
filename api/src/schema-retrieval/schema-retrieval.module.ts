import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { SchemaCatalogService } from '../schema-catalog/schema-catalog.service';
import { SchemaRetrievalController } from './schema-retrieval.controller';
import { SchemaRetrievalService } from './schema-retrieval.service';

@Module({
  imports: [EmbeddingsModule],
  controllers: [SchemaRetrievalController],
  providers: [SchemaCatalogService, SchemaRetrievalService],
  exports: [SchemaRetrievalService],
})
export class SchemaRetrievalModule {}
