export type EmbeddingInputType = 'query' | 'document';

/**
 * Wraps whatever embedding vendor is behind it (Voyage today), per the
 * brief's extensibility note #3: swapping providers should be a config/DI
 * change, not a rewrite of SchemaRetrievalService.
 */
export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}
