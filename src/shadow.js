const { query } = require('./db.js');

const INSERT_SQL = `
  INSERT INTO shadow_captures (
    node, conversation_id, org_id, org_name, user_id, user_email,
    request_model, request_system, request_messages, request_tools, thinking_enabled,
    claude_response, claude_stop_reason, claude_tokens_in, claude_tokens_out, claude_latency_ms,
    status
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
  RETURNING id
`;

/**
 * Serialize a value to a JSON string if it's an object/array, or return it
 * as-is if it's already a string or null. Used for the JSONB request columns
 * (pg casts the JSON string to jsonb) and for the TEXT system column.
 */
function toText(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Extract plain text from an Anthropic `system` field, which may be a string
 * or an array of `{ type: 'text', text }` blocks.
 */
function systemToText(system) {
  if (system == null) return null;
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
  return null;
}

/**
 * Pull the text from an Anthropic messages.create() response — the concatenation
 * of its `text` content blocks. Returns null if there is no text content.
 */
function extractClaudeText(response) {
  if (!response || !Array.isArray(response.content)) return null;
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return text || null;
}

/**
 * Convert a captured Anthropic request into an Ollama /api/chat `messages[]`.
 *
 * v1 rules (single source of truth for both the dashboard replay endpoint and
 * the offline runner):
 *   - Prepend a system message when `system` is present (string or text blocks).
 *   - String message content passes through; array content is reduced to its
 *     `text` blocks joined together.
 *   - Tool definitions and `tool_use` / `tool_result` blocks are dropped.
 *
 * @param {object} req
 * @param {string|Array} [req.system]
 * @param {Array} [req.messages]
 * @returns {Array<{role: string, content: string}>}
 */
function anthropicToOllamaMessages({ system, messages } = {}) {
  const out = [];
  const systemText = systemToText(system);
  if (systemText) out.push({ role: 'system', content: systemText });

  for (const m of messages || []) {
    if (!m) continue;
    let content;
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    } else {
      content = '';
    }
    // Skip messages that carry no textual content (e.g. tool-only turns).
    if (!content) continue;
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
  }

  return out;
}

/**
 * Insert one shadow_captures row.
 *
 * Returns { id } on success, or null on error. Never throws.
 */
async function captureShadow({
  node = null,
  model = null,
  system = null,
  messages = null,
  tools = null,
  thinkingEnabled = null,
  claudeResponse = null,
  stopReason = null,
  tokensIn = null,
  tokensOut = null,
  latencyMs = null,
  conversationId = null,
  orgId = null,
  orgName = null,
  userId = null,
  userEmail = null,
}) {
  try {
    const result = await query(INSERT_SQL, [
      node,
      conversationId,
      orgId,
      orgName,
      userId,
      userEmail,
      model,
      systemToText(system),
      toText(messages),
      toText(tools),
      thinkingEnabled,
      toText(claudeResponse),
      stopReason,
      tokensIn,
      tokensOut,
      latencyMs,
      'captured',
    ]);
    return { id: result.rows[0].id };
  } catch (err) {
    console.error('[distillation/shadow] Failed to capture shadow row:', err.message);
    return null;
  }
}

/**
 * Fire-and-forget variant. Starts the insert but does not await it.
 * Errors are logged and swallowed — never blocks or crashes the caller.
 */
function captureShadowAsync(params) {
  captureShadow(params).catch(() => {
    // Already logged in captureShadow's catch block
  });
}

module.exports = {
  captureShadow,
  captureShadowAsync,
  anthropicToOllamaMessages,
  extractClaudeText,
};
