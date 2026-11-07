import type {
  GenerateTextInput,
  GenerateTextResult,
  LlmProvider,
  StreamChunk,
} from './llm-provider.js';

/**
 * Google Gemini 어댑터 (fetch 기반, SDK 의존성 없음).
 * generativelanguage REST API + API 키.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'google';

  constructor(private readonly options: { apiKey: string; model?: string; baseUrl?: string }) {}

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const baseUrl =
      this.options.baseUrl?.replace(/\/$/, '') || 'https://generativelanguage.googleapis.com';
    const model = this.options.model || 'gemini-2.0-flash';
    const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': this.options.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig: {
          maxOutputTokens: input.maxTokens ?? 2048,
          ...(input.temperature != null ? { temperature: input.temperature } : {}),
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini API 오류 (${response.status}): ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return { text, model, provider: 'google' };
  }

  async *streamText(input: GenerateTextInput): AsyncIterable<StreamChunk> {
    const result = await this.generateText(input);
    yield { type: 'text_delta', text: result.text };
    yield { type: 'done' };
  }
}
