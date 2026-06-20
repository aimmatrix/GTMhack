import type { LLMProvider } from '../../src/types';

/** Configurable LLM stub so tests can exercise the gemini code path. */
export class StubLLMProvider implements LLMProvider {
  readonly name = 'gemini' as const;

  constructor(
    private readonly jsonResponse: unknown,
    private readonly shouldThrow = false,
  ) {}

  async generateText(_prompt: string): Promise<string> {
    return JSON.stringify(this.jsonResponse);
  }

  async generateJson<T = unknown>(_prompt: string, _schemaHint?: string): Promise<T> {
    if (this.shouldThrow) throw new Error('stub-llm: forced failure');
    return this.jsonResponse as T;
  }
}
