const { query } = require('./db.js');
const { classifyQuery } = require('./classifier.js');
const { scoreComplexity } = require('./complexity.js');
const { calculateCost } = require('./cost.js');

const INSERT_SQL = `
  INSERT INTO interactions (
    user_query, rag_context, material_context,
    compliance_context, system_prompt, conversation_id,
    sonnet_response, sonnet_model, sonnet_tokens_in,
    sonnet_tokens_out, sonnet_latency_ms, sonnet_cost,
    query_category, query_complexity
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  RETURNING id
`;

/**
 * Serialize a value to a JSON string if it's an object/array,
 * or return it as-is if it's already a string or null.
 */
function toText(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Log an interaction to the database.
 *
 * Auto-classifies query category and complexity if not provided.
 * Auto-calculates cost from token counts if cost is not provided.
 *
 * Returns { id, category, complexity } on success, or null on error.
 * Never throws.
 */
async function logInteraction({
  userQuery,
  ragContext = null,
  materialContext = null,
  complianceContext = null,
  systemPrompt = null,
  conversationId = null,
  sonnetResponse = null,
  sonnetModel = null,
  tokensIn = null,
  tokensOut = null,
  latencyMs = null,
  cost = null,
}) {
  try {
    const category = classifyQuery(userQuery);
    const complexity = scoreComplexity(userQuery, ragContext);
    const computedCost = cost ?? (tokensIn != null && tokensOut != null
      ? calculateCost(tokensIn, tokensOut)
      : null);

    const result = await query(INSERT_SQL, [
      userQuery,
      toText(ragContext),
      toText(materialContext),
      toText(complianceContext),
      toText(systemPrompt),
      conversationId,
      toText(sonnetResponse),
      sonnetModel,
      tokensIn,
      tokensOut,
      latencyMs,
      computedCost,
      category,
      complexity,
    ]);

    const id = result.rows[0].id;
    return { id, category, complexity };
  } catch (err) {
    console.error('[distillation/logger] Failed to log interaction:', err.message);
    return null;
  }
}

/**
 * Fire-and-forget variant. Starts the insert but does not await it.
 * Errors are logged and swallowed — never blocks or crashes the caller.
 */
function logInteractionAsync(params) {
  logInteraction(params).catch(() => {
    // Already logged in logInteraction's catch block
  });
}

module.exports = { logInteraction, logInteractionAsync };
