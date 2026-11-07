import {
  parseSize,
  type ImageGenerateInput,
  type ImageGenerateResult,
  type ImageInpaintInput,
  type ImageInpaintResult,
  type ImageProvider,
} from './provider';

/**
 * Mock 이미지 provider: 프롬프트 텍스트가 들어간 SVG 플레이스홀더를 생성한다.
 * 실제 생성 모델 어댑터로 교체해도 인터페이스는 동일하다.
 */
export class MockImageProvider implements ImageProvider {
  readonly name = 'mock';

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const { width, height } = parseSize(input.size);
    const count = Math.min(Math.max(input.count ?? 1, 1), 4);
    const images = Array.from({ length: count }, (_, i) =>
      makeSvg(input.prompt, width, height, i, input.style),
    );
    return { images, provider: 'mock', model: 'mock-image-1' };
  }

  async inpaint(input: ImageInpaintInput): Promise<ImageInpaintResult> {
    const { width, height } = parseSize(input.size);
    const image = makeSvg(`[인페인트] ${input.prompt}`, width, height, 9, 'inpaint');
    return { image, provider: 'mock', model: 'mock-inpaint-1' };
  }
}

// 화이트&블랙 디자인에 맞춘 그레이스케일 팔레트
const PALETTES = [
  ['#3f3f46', '#18181b'],
  ['#52525b', '#27272a'],
  ['#71717a', '#3f3f46'],
  ['#a1a1aa', '#52525b'],
  ['#d4d4d8', '#71717a'],
  ['#27272a', '#09090b'],
  ['#9a9aa3', '#4a4a52'],
  ['#6b6b74', '#2e2e33'],
  ['#828891', '#3a4046'],
  ['#c0c0c6', '#8a8a92'],
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeSvg(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  style?: string,
): { data: Uint8Array; mimeType: string; width: number; height: number } {
  const palette = PALETTES[seed % PALETTES.length] ?? PALETTES[0]!;
  const label = escapeXml(prompt.slice(0, 60));
  const styleLabel = style ? escapeXml(style) : 'interior';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette[0]}"/>
      <stop offset="100%" stop-color="${palette[1]}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="${width * 0.06}" y="${height * 0.62}" width="${width * 0.88}" height="${height * 0.3}" rx="12" fill="rgba(0,0,0,0.35)"/>
  <text x="${width * 0.09}" y="${height * 0.72}" font-family="sans-serif" font-size="${Math.round(height * 0.04)}" fill="#ffffff" opacity="0.85">AI 생성 이미지 (mock) · ${styleLabel}</text>
  <text x="${width * 0.09}" y="${height * 0.8}" font-family="sans-serif" font-size="${Math.round(height * 0.045)}" fill="#ffffff" font-weight="bold">${label}</text>
</svg>`;
  return {
    data: new TextEncoder().encode(svg),
    mimeType: 'image/svg+xml',
    width,
    height,
  };
}
