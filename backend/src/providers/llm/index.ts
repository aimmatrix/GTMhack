import type { LLMProvider } from '../../types';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { GeminiProvider } from './gemini';
import { MockLLMProvider } from './mock';

const log = logger('llm');

/**
 * Build the active LLM provider from config. Returns {@link GeminiProvider}
 * when a Gemini key/provider is configured, otherwise the deterministic
 * {@link MockLLMProvider} so the demo runs keyless.
 */
export function createLLMProvider(): LLMProvider {
  if (config.llm.provider === 'gemini') {
    log.info(`using gemini provider (model=${config.llm.model})`);
    return new GeminiProvider();
  }
  log.info('using mock llm provider (deterministic, no API key)');
  return new MockLLMProvider();
}

export { GeminiProvider, MockLLMProvider };
