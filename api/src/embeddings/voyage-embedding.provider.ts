import { Injectable } from '@nestjs/common';
import { EmbeddingInputType, EmbeddingProvider } from './embedding-provider.interface';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

interface VoyageEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

@Injectable()
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  // voyage-4-lite's default output_dimension (shared across the whole
  // Voyage 4 family). If you change VOYAGE_MODEL or request a different
  // output_dimension, this MUST match the vector(N) column width in
  // db/init — pgvector will reject mismatched dimensions at insert time,
  // not silently truncate/pad.
  //
  // voyage-4-lite specifically (not voyage-3.5): the "Older models"
  // pricing tier no longer includes free tokens. voyage-4-lite carries the
  // same 200M-token free allowance as the rest of the current Voyage 4
  // family and is the cheapest of them — for this project's data volume
  // (a handful of table docs + test queries), usage stays free either way.
  readonly dimensions = 1024;

  private readonly apiKey = process.env.VOYAGE_API_KEY;
  private readonly model = process.env.VOYAGE_MODEL ?? 'voyage-4-lite';

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('VOYAGE_API_KEY is not set');
    }

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        // Voyage distinguishes query vs. document embeddings internally
        // for retrieval quality — pass this through rather than hardcoding.
        input_type: inputType,
        output_dimension: this.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage embeddings request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as VoyageEmbeddingResponse;
    // Voyage's docs don't guarantee response order matches input order —
    // sort by the returned index defensively rather than assume it.
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}