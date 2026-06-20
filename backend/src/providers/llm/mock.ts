import type { LLMProvider } from '../../types';

/**
 * No-op LLM provider used when no API key is configured.
 *
 * The brief and research services branch on `llm.name === 'mock'` and use a
 * deterministic code path instead of calling the model, so these methods exist
 * only to satisfy the {@link LLMProvider} interface and the factory. If
 * `generateJson` is ever reached it means a service forgot to branch — fail
 * loudly rather than silently return garbage.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock' as const;

  async generateText(_prompt: string): Promise<string> {
    return '';
  }

  async generateJson<T = unknown>(_prompt: string, _schemaHint?: string): Promise<T> {
    throw new Error('mock-llm: services must use deterministic path');
  }
}
