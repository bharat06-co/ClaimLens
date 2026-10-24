// Generate real local embeddings with the model used for policy search.
// Cache a feature-extraction function, not the broad union of all HF pipelines.
// Model: onnx-community/all-MiniLM-L6-v2-ONNX (384 dimensions).
type Embedder = (text: string) => Promise<number[]>;
let instance: Promise<Embedder> | undefined;

async function loadEmbedder(): Promise<Embedder> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = process.env.HF_HOME || './model-cache';
  const extractor = await pipeline(
    'feature-extraction',
    'onnx-community/all-MiniLM-L6-v2-ONNX',
    { dtype: 'fp32', device: 'cpu' }
  );

  return async (text: string): Promise<number[]> => {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data, value => Number(Number(value).toFixed(7)));
    if (vector.length !== 384 || vector.some(value => !Number.isFinite(value))) {
      throw new Error('Embedding model returned an invalid vector');
    }
    return vector;
  };
}

export async function embed(text: string): Promise<number[]> {
  if (!instance) {
    instance = loadEmbedder().catch(error => {
      instance = undefined;
      throw error;
    });
  }
  return (await instance)(text);
}

export function vectorLiteral(vector: number[]): string { return `[${vector.join(',')}]`; }

// Simple, reproducible word windows; overlapping chunks preserve context across boundaries.
export function chunkPolicy(text: string, size = 115, overlap = 25): string[] {
  if (!(size > overlap && overlap >= 0)) throw new Error('Invalid chunk parameters');
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const result: string[] = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    result.push(words.slice(i, i + size).join(' '));
    if (i + size >= words.length) break;
  }
  return result;
}
