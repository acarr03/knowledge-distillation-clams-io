const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyQuery, CATEGORIES } = require('../src/classifier.js');
const { sampleQueries } = require('./fixtures/anthropic-responses.js');

describe('classifyQuery', () => {
  // Verify every category from fixtures maps correctly
  for (const [expected, query] of Object.entries(sampleQueries)) {
    it(`classifies "${query}" as ${expected}`, () => {
      assert.equal(classifyQuery(query), expected);
    });
  }

  // Edge cases and regression tests
  it('returns general_engineering for empty/null input', () => {
    assert.equal(classifyQuery(''), 'general_engineering');
    assert.equal(classifyQuery(null), 'general_engineering');
    assert.equal(classifyQuery(undefined), 'general_engineering');
  });

  // Word boundary tests — avoid false positives
  it('does not classify "epsilon" as unit_conversion (no false psi match)', () => {
    const result = classifyQuery('Tell me about the epsilon value of this polymer');
    assert.notEqual(result, 'unit_conversion');
  });

  it('does not classify "comprehensive" as comparison', () => {
    const result = classifyQuery('Give me a comprehensive overview of PEEK properties');
    assert.notEqual(result, 'comparison');
  });

  // Rule ordering: compliance before comparison
  it('classifies "Compare RoHS vs REACH requirements" as compliance_check', () => {
    assert.equal(classifyQuery('Compare RoHS vs REACH requirements'), 'compliance_check');
  });

  // Additional coverage
  it('classifies "What is the flexural modulus of Torlon?" as material_lookup', () => {
    assert.equal(classifyQuery('What is the flexural modulus of Torlon?'), 'material_lookup');
  });

  it('classifies "Convert 500 degrees Fahrenheit to Celsius" as unit_conversion', () => {
    assert.equal(classifyQuery('Convert 500 degrees Fahrenheit to Celsius'), 'unit_conversion');
  });

  it('classifies "Is this material FDA certified?" as compliance_check', () => {
    assert.equal(classifyQuery('Is this material FDA certified?'), 'compliance_check');
  });

  it('classifies "Which polymer is best for my bearing?" as multi_constraint_selection', () => {
    assert.equal(classifyQuery('Which polymer is best for my bearing?'), 'multi_constraint_selection');
  });

  it('classifies "Show me datasheets for Vespel" as document_search', () => {
    assert.equal(classifyQuery('Show me datasheets for Vespel'), 'document_search');
  });

  it('classifies "Difference between amorphous and semi-crystalline" as comparison', () => {
    assert.equal(classifyQuery('What is the difference between amorphous and semi-crystalline polymers?'), 'comparison');
  });

  // All returned categories must be valid CHECK constraint values
  it('only returns valid categories', () => {
    const testQueries = [
      ...Object.values(sampleQueries),
      'random question about stuff',
      '',
      'a'.repeat(1000),
    ];
    for (const q of testQueries) {
      const cat = classifyQuery(q);
      assert.ok(CATEGORIES.includes(cat), `"${cat}" is not a valid category`);
    }
  });
});
