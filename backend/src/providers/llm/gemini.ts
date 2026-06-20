import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import type { LLMProvider } from '../../types';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const log = logger('llm');

/** Hard cap so hung Gemini calls don't block the orchestrator. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Google Gemini implementation of {@link LLMProvider}.
 *
 * Uses the `@google/generative-ai` SDK with a low temperature so structured
 * extraction (brief building, research notes) stays stable. The API key is
 * never logged.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;

  private readonly model: GenerativeModel;

  constructor() {
    const client = new GoogleGenerativeAI(config.llm.apiKey);
    this.model = client.getGenerativeModel({
      model: config.llm.model,
      generationConfig: {
        // Low temperature: faithful extraction over creative prose.
        temperature: 0.2,
      },
    });
  }

  async generateText(prompt: string): Promise<string> {
    const result = await withTimeout(
      this.model.generateContent(prompt),
      REQUEST_TIMEOUT_MS,
    );
    return result.response.text();
  }

  async generateJson<T = unknown>(prompt: string, schemaHint?: string): Promise<T> {
    const jsonInstruction =
      '\n\nReturn ONLY valid, minified JSON. No prose, no markdown, no code fences.' +
      (schemaHint ? `\nThe JSON MUST match this shape:\n${schemaHint}` : '');

    const firstPrompt = `${prompt}${jsonInstruction}`;
    let raw = await this.generateText(firstPrompt);

    try {
      return parseJson<T>(raw);
    } catch (err) {
      log.warn('gemini json parse failed, retrying once', (err as Error).message);
      // Retry once with a blunt reminder, echoing back the bad output.
      const retryPrompt =
        `${prompt}${jsonInstruction}\n\n` +
        'Your previous answer was NOT valid JSON. Return ONLY JSON, no prose, no fences.';
      raw = await this.generateText(retryPrompt);
      try {
        return parseJson<T>(raw);
      } catch (err2) {
        log.error('gemini json parse failed after retry', (err2 as Error).message);
        throw new Error('gemini: model did not return valid JSON');
      }
    }
  }
}

/** Strip ``` / ```json fences and surrounding whitespace, then JSON.parse. */
function parseJson<T>(text: string): T {
  let cleaned = text.trim();

  // Remove an opening fence (```json or ```) and the trailing fence.
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  // As a last resort, slice to the outermost JSON object/array if the model
  // wrapped the JSON in stray prose.
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const firstObj = cleaned.indexOf('{');
    const firstArr = cleaned.indexOf('[');
    const candidates = [firstObj, firstArr].filter((i) => i >= 0);
    if (candidates.length) {
      const start = Math.min(...candidates);
      const lastObj = cleaned.lastIndexOf('}');
      const lastArr = cleaned.lastIndexOf(']');
      const end = Math.max(lastObj, lastArr);
      if (end > start) cleaned = cleaned.slice(start, end + 1);
    }
  }

  return JSON.parse(cleaned) as T;
}

/** Reject the call if Gemini doesn't respond within `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('gemini: request timed out')), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
