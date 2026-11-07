import type {
  GenerateTextInput,
  GenerateTextResult,
  LlmProvider,
  StreamChunk,
} from './llm-provider.js';

/**
 * xAI Grok 어댑터. xAI는 OpenAI 호환 /v1/chat/completions API를 제공한다.
 */
export class GrokProvider implements LlmProvider {
  readonly name = 'grok';

  constructor(private readonly options: { apiKey: string; model?: string; baseUrl?: string }) {}

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const baseUrl = this.options.baseUrl?.replace(/\/$/, '') || 'https://api.x.ai';
    const model = this.options.model || 'grok-2-latest';
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens ?? 2048,
        temperature: input.temperature,
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.prompt },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Grok API 오류 (${response.status}): ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      model: string;
      choices: { message?: { content?: string } }[];
    };
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      provider: 'grok',
    };
  }

  async *streamText(input: GenerateTextInput): AsyncIterable<StreamChunk> {
    const result = await this.generateText(input);
    yield { type: 'text_delta', text: result.text };
    yield { type: 'done' };
  }
}
