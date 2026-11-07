import {
  parseSize,
  type ImageGenerateInput,
  type ImageGenerateResult,
  type ImageInpaintInput,
  type ImageInpaintResult,
  type ImageProvider,
} from './provider.js';

/**
 * OpenAI 이미지 생성 어댑터 (gpt-image-1 / DALL·E). fetch 기반, SDK 의존성 없음.
 * 등록된 OpenAI API 키로 실제 이미지를 생성한다.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = 'openai';

  constructor(
    private readonly options: { apiKey: string; model?: string; baseUrl?: string },
  ) {}

  private get base(): string {
    return this.options.baseUrl?.replace(/\/$/, '') || 'https://api.openai.com';
  }

  /** OpenAI 이미지 API가 허용하는 크기로 보정 */
  private normalizeSize(size?: string): string {
    const allowed = ['1024x1024', '1024x1536', '1536x1024'];
    if (size && allowed.includes(size)) return size;
    const { width, height } = parseSize(size);
    if (width > height) return '1536x1024';
    if (height > width) return '1024x1536';
    return '1024x1024';
  }

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const size = this.normalizeSize(input.size);
    const prompt = input.style ? `${input.prompt} (스타일: ${input.style})` : input.prompt;
    const n = Math.min(Math.max(input.count ?? 1, 1), 4);
    // 우선 gpt-image-1, 접근 권한이 없거나 모델 오류면 dall-e-3로 폴백
    const candidates = this.options.model ? [this.options.model] : ['gpt-image-1', 'dall-e-3'];

    let lastError = '';
    for (const model of candidates) {
      const dalle = model.startsWith('dall-e');
      const res = await fetch(`${this.base}/v1/images/generations`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          // dall-e-3는 n=1만, 응답이 URL이라 b64 요청
          n: dalle ? 1 : n,
          size: dalle ? '1024x1024' : size,
          ...(dalle ? { response_format: 'b64_json' } : {}),
        }),
      });
      if (!res.ok) {
        lastError = `${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`;
        // 모델 미지원(404)·권한(403) 이면 다음 후보로
        if (res.status === 404 || res.status === 403 || res.status === 400) continue;
        throw new Error(`OpenAI 이미지 API 오류 (${lastError})`);
      }
      const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
      const [w, h] = (dalle ? '1024x1024' : size).split('x').map(Number);
      const images = await Promise.all(
        (data.data ?? []).map(async (d) => ({
          data: await toBytes(d),
          mimeType: 'image/png',
          width: w ?? 1024,
          height: h ?? 1024,
        })),
      );
      if (images.length > 0) return { images, provider: 'openai', model };
    }
    throw new Error(`OpenAI 이미지 생성 실패 (${lastError || '응답 없음'})`);
  }

  async inpaint(input: ImageInpaintInput): Promise<ImageInpaintResult> {
    const model = this.options.model || 'gpt-image-1';
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', input.prompt);
    form.append('image', toBlob(input.baseImage, input.baseMimeType || 'image/png'), 'image.png');
    if (input.mask) {
      form.append('mask', toBlob(input.mask, 'image/png'), 'mask.png');
    }
    const res = await fetch(`${this.base}/v1/images/edits`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI 인페인트 API 오류 (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = data.data?.[0];
    if (!first) throw new Error('OpenAI 인페인트 응답이 비어 있습니다.');
    const { width, height } = parseSize(input.size);
    return {
      image: { data: await toBytes(first), mimeType: 'image/png', width, height },
      provider: 'openai',
      model,
    };
  }
}

/** Uint8Array(공유버퍼 가능)를 Blob으로 안전 변환 */
function toBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

async function toBytes(d: { b64_json?: string; url?: string }): Promise<Uint8Array> {
  if (d.b64_json) return Uint8Array.from(Buffer.from(d.b64_json, 'base64'));
  if (d.url) {
    const res = await fetch(d.url);
    if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error('이미지 데이터가 없습니다.');
}
