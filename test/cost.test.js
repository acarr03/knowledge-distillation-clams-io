const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateCost, calculateCostFromUsage } = require('../src/cost.js');

describe('calculateCost', () => {
  it('calculates cost for typical Sonnet query', () => {
    // 2000 input tokens at $3/1M = $0.006
    // 1000 output tokens at $15/1M = $0.015
    // Total = $0.021
    const cost = calculateCost(2000, 1000);
    assert.equal(cost, '0.021000');
  });

  it('returns string with 6 decimal places', () => {
    const cost = calculateCost(100, 100);
    assert.match(cost, /^\d+\.\d{6}$/);
  });

  it('handles zero tokens', () => {
    assert.equal(calculateCost(0, 0), '0.000000');
  });

  it('matches expected daily cost from CLAUDE.md (~$10.50/day at 500 queries)', () => {
    // 500 queries * avg 2000 input + 1000 output
    const dailyCost = parseFloat(calculateCost(500 * 2000, 500 * 1000));
    // CLAUDE.md says ~$10.50/day
    assert.ok(dailyCost > 10 && dailyCost < 11, `Expected ~$10.50, got $${dailyCost}`);
  });
});

describe('calculateCostFromUsage', () => {
  it('accepts Anthropic SDK usage object', () => {
    const usage = { input_tokens: 1850, output_tokens: 420 };
    const cost = calculateCostFromUsage(usage);
    // 1850 * 0.000003 + 420 * 0.000015 = 0.00555 + 0.0063 = 0.01185
    assert.equal(cost, '0.011850');
  });
});
