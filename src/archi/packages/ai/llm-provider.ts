/** LLM Provider Adapter 인터페이스. ARCHITECTURE.md 6.1 참조 */
export type GenerateTextInput = {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
};

export type GenerateTextResult = {
  text: string;
  model: string;
  provider: string;
};

export type StreamChunk = {
  type: 'text_delta' | 'done';
  text?: string;
};

export interface LlmProvider {
  readonly name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  streamText(input: GenerateTextInput): AsyncIterable<StreamChunk>;
}
