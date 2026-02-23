const { classifyQuery, CATEGORIES } = require('./src/classifier.js');
const { scoreComplexity } = require('./src/complexity.js');
const { calculateCost, calculateCostFromUsage } = require('./src/cost.js');
const { getPool, query, closePool } = require('./src/db.js');
const { logInteraction, logInteractionAsync } = require('./src/logger.js');
const { ClamsAnthropicClient } = require('./src/client.js');
const { config } = require('./src/config.js');

module.exports = {
  classifyQuery,
  CATEGORIES,
  scoreComplexity,
  calculateCost,
  calculateCostFromUsage,
  getPool,
  query,
  closePool,
  logInteraction,
  logInteractionAsync,
  ClamsAnthropicClient,
  config,
};
