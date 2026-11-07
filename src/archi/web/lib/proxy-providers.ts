import type { GenerateTextInput, GenerateTextResult, LlmProvider, StreamChunk } from '@archi/ai';
import type {
  ImageGenerateInput,
  ImageGenerateResult,
  ImageInpaintInput,
  ImageInpaintResult,
  ImageProvider,
} from '@archi/image';
import { callArchiServer } from './server-proxy';

/** Which provider/key the server should use. No key → the server's own env key. */
export type ProxyTarget = {
  provider: 'openai' | 'anthropic' | 'google' | 'grok';
  model?: string;
  baseUrl?: string;
  encryptedApiKey?: string;
};

/**
 * LlmProvider that runs the original provider adapter on the server (api/archi-llm),
 * so API keys never reach the browser.
 */
export class ProxyLlmProvider implements LlmProvider {
  readonly name: string;

  constructor(private readonly target: ProxyTarget) {
    this.name = target.provider;
  }

  generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    return callArchiServer<GenerateTextResult>('generate', { target: this.target, input });
  }

  /** The original's chat also returned the full JSON reply (typing effect is client-side). */
  async *streamText(input: GenerateTextInput): AsyncIterable<StreamChunk> {
    const result = await this.generateText(input);
    yield { type: 'text_delta', text: result.text };
    yield { type: 'done' };
  }
}

type WireImage = { b64: string; mimeType: string; width: number; height: number };

function fromWire(image: WireImage) {
  return {
    data: Uint8Array.from(atob(image.b64), (c) => c.charCodeAt(0)),
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** ImageProvider backed by the server-side OpenAI image adapter. */
export class ProxyImageProvider implements ImageProvider {
  readonly name = 'openai';

  constructor(private readonly target: ProxyTarget) {}

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    // One image per request keeps each response under the serverless 4.5MB body limit.
    const count = Math.min(Math.max(input.count ?? 1, 1), 4);
    const results: ImageGenerateResult[] = [];
    for (let i = 0; i < count; i += 1) {
      const r = await callArchiServer<{ images: WireImage[]; provider: string; model: string }>('image-generate', {
        target: this.target,
        input: { ...input, count: 1 },
      });
      results.push({ ...r, images: r.images.map(fromWire) });
    }
    return {
      images: results.flatMap((r) => r.images),
      provider: results[0]?.provider ?? 'openai',
      model: results[0]?.model ?? '',
    };
  }

  async inpaint(input: ImageInpaintInput): Promise<ImageInpaintResult> {
    const r = await callArchiServer<{ image: WireImage; provider: string; model: string }>('image-inpaint', {
      target: this.target,
      input: {
        prompt: input.prompt,
        size: input.size,
        baseMimeType: input.baseMimeType,
        baseImageUrl: input.baseImageUrl,
        baseImageB64: input.baseImageUrl ? undefined : toBase64(input.baseImage),
        maskB64: input.mask ? toBase64(input.mask) : undefined,
      },
    });
    return { ...r, image: fromWire(r.image) };
  }
}
