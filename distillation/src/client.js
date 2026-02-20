import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { logInteractionAsync } from './logger.js';
import { calculateCostFromUsage } from './cost.js';

/**
 * Drop-in Anthropic client wrapper that auto-logs every message creation
 * to the distillation database.
 *
 * Uses composition (not subclass) so it won't break on SDK updates.
 *
 * Usage:
 *   const client = new ClamsAnthropicClient();
 *   const response = await client.createMessage(
 *     { model: 'claude-sonnet-4-5-20250514', max_tokens: 4096, messages: [...] },
 *     { ragContext, materialContext, complianceContext, conversationId }
 *   );
 */
export class ClamsAnthropicClient {
  #client;

  constructor(options = {}) {
    this.#client = new Anthropic({
      apiKey: options.apiKey || config.anthropicApiKey,
      ...options,
    });
  }

  /**
   * Access the underlying Anthropic client for streaming or other advanced features.
   */
  get raw() {
    return this.#client;
  }

  /**
   * Create a message and auto-log the interaction.
   *
   * @param {object} params - Standard Anthropic messages.create() params
   * @param {object} context - CLAMS context for logging
   * @param {string|object} [context.ragContext]
   * @param {string|object} [context.materialContext]
   * @param {string|object} [context.complianceContext]
   * @param {string} [context.conversationId]
   * @returns {object} Unmodified Anthropic API response
   */
  async createMessage(params, context = {}) {
    const start = performance.now();
    let response;
    let error;

    try {
      response = await this.#client.messages.create(params);
    } catch (err) {
      error = err;
    }

    const latencyMs = Math.round(performance.now() - start);

    // Extract the user query from the last user message
    const userQuery = this.#extractUserQuery(params.messages);

    // Log regardless of success/failure — fire and forget
    logInteractionAsync({
      userQuery,
      ragContext: context.ragContext ?? null,
      materialContext: context.materialContext ?? null,
      complianceContext: context.complianceContext ?? null,
      systemPrompt: params.system ?? null,
      conversationId: context.conversationId ?? null,
      sonnetResponse: error
        ? `[ERROR] ${error.message}`
        : this.#extractResponseText(response),
      sonnetModel: response?.model ?? params.model ?? null,
      tokensIn: response?.usage?.input_tokens ?? null,
      tokensOut: response?.usage?.output_tokens ?? null,
      latencyMs,
      cost: response?.usage
        ? calculateCostFromUsage(response.usage)
        : null,
    });

    if (error) throw error;
    return response;
  }

  #extractUserQuery(messages) {
    if (!messages || messages.length === 0) return '';
    const last = messages[messages.length - 1];
    if (typeof last.content === 'string') return last.content;
    if (Array.isArray(last.content)) {
      const textBlock = last.content.find((b) => b.type === 'text');
      return textBlock?.text ?? '';
    }
    return '';
  }

  #extractResponseText(response) {
    if (!response?.content) return null;
    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
}
