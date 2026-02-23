const { config } = require('./config.js');

/**
 * Calculate cost for a Sonnet API call.
 * Returns a string with 6 decimal places to match NUMERIC(10,6) column.
 */
function calculateCost(inputTokens, outputTokens) {
  const cost =
    inputTokens * config.pricing.inputPerToken +
    outputTokens * config.pricing.outputPerToken;
  return cost.toFixed(6);
}

/**
 * Calculate cost from an Anthropic SDK usage object.
 * usage: { input_tokens: number, output_tokens: number }
 */
function calculateCostFromUsage(usage) {
  return calculateCost(usage.input_tokens, usage.output_tokens);
}

module.exports = { calculateCost, calculateCostFromUsage };
