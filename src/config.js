// Sonnet 4.5 pricing (per token)
const SONNET_INPUT_PER_TOKEN = 3 / 1_000_000;   // $3 per 1M input tokens
const SONNET_OUTPUT_PER_TOKEN = 15 / 1_000_000;  // $15 per 1M output tokens

const config = {
  databaseUrl: process.env.DISTILLATION_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/clams_distillation',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // pg Pool settings
  pool: {
    max: parseInt(process.env.PG_POOL_MAX || '5', 10),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT || '5000', 10),
  },

  // Sonnet pricing
  pricing: {
    inputPerToken: parseFloat(process.env.SONNET_INPUT_PER_TOKEN || String(SONNET_INPUT_PER_TOKEN)),
    outputPerToken: parseFloat(process.env.SONNET_OUTPUT_PER_TOKEN || String(SONNET_OUTPUT_PER_TOKEN)),
  },
};

module.exports = { config };
