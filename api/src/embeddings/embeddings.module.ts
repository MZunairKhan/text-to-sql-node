import { Module } from '@nestjs/common';
import { VoyageEmbeddingProvider } from './voyage-embedding.provider';

export const EMBEDDING_PROVIDER = 'EMBEDDING_PROVIDER';

@Module({
  providers: [{ provide: EMBEDDING_PROVIDER, useClass: VoyageEmbeddingProvider }],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingsModule {}
