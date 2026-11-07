import type {
  GenerateTextInput,
  GenerateTextResult,
  LlmProvider,
  StreamChunk,
} from './llm-provider.js';

/**
 * OpenAI 어댑터 (fetch 기반, SDK 의존성 없음).
 * 인증: API 키 또는 ChatGPT 계정 OAuth access token — 둘 다 Bearer 헤더 사용.
 *
 * 호출 방식: 신모델(gpt-5.x 등)은 Responses API(/v1/responses)를 쓰고, 안 되면
 * 구형 Chat Completions(/v1/chat/completions)로 폴백한다 — 모델별 API 차이를 흡수.
 */
export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';

  constructor(
    private readonly options: {
      apiKey?: string;
      /** ChatGPT 계정 OAuth access token */
      authToken?: string;
      model?: string;
      baseUrl?: string;
    },
  ) {}

  private get token(): string {
    const t = this.options.authToken ?? this.options.apiKey;
    if (!t) throw new Error('OpenAI 인증 정보(apiKey 또는 authToken)가 없습니다.');
    return t;
  }

  private get base(): string {
    return this.options.baseUrl?.replace(/\/$/, '') || 'https://api.openai.com';
  }

  private get model(): string {
    return this.options.model || 'gpt-5';
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    // 1) Responses API (현행 표준, 신모델 지원)
    try {
      return await this.viaResponses(input);
    } catch (err) {
      // 모델이 Responses API를 지원하지 않거나 엔드포인트가 없는 경우 폴백
      const msg = err instanceof Error ? err.message : '';
      if (!/404|not found|unsupported|unknown|chat model|completions/i.test(msg)) {
        // 명백한 미지원 신호가 아니면 그대로 던진다 (인증 오류 등)
        throw err;
      }
    }
    // 2) Chat Completions 폴백 (구형 모델)
    return this.viaChatCompletions(input);
  }

  private async viaResponses(input: GenerateTextInput): Promise<GenerateTextResult> {
    const res = await fetchWithTimeout(`${this.base}/v1/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        ...(input.system ? { instructions: input.system } : {}),
        input: input.prompt,
        max_output_tokens: input.maxTokens ?? 2048,
        ...(input.temperature != null ? { temperature: input.temperature } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI Responses 오류 (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      model?: string;
      output_text?: string;
      output?: { content?: { type?: string; text?: string }[] }[];
    };
    const text =
      data.output_text ??
      (data.output ?? [])
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === 'output_text' || c.text)
        .map((c) => c.text ?? '')
        .join('');
    return { text, model: data.model ?? this.model, provider: 'openai' };
  }

  private async viaChatCompletions(input: GenerateTextInput): Promise<GenerateTextResult> {
    const res = await fetchWithTimeout(`${this.base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: input.maxTokens ?? 2048,
        ...(input.temperature != null ? { temperature: input.temperature } : {}),
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI API 오류 (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      model: string;
      choices: { message?: { content?: string } }[];
    };
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      provider: 'openai',
    };
  }

  async *streamText(input: GenerateTextInput): AsyncIterable<StreamChunk> {
    const result = await this.generateText(input);
    yield { type: 'text_delta', text: result.text };
    yield { type: 'done' };
  }
}

/** 모델이 무한 대기하면 ERR_EMPTY_RESPONSE가 나므로 타임아웃을 건다 (기본 90초) */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 90_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`모델 응답 시간 초과 (${Math.round(timeoutMs / 1000)}초)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
