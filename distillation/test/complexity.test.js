import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreComplexity } from '../src/complexity.js';

describe('scoreComplexity', () => {
  it('returns 1 for a simple, short query', () => {
    assert.equal(scoreComplexity('Convert 14.5 MPa to psi'), 1);
  });

  it('returns higher score for queries with multiple constraints', () => {
    const simple = scoreComplexity('What is the tensile strength of PEEK?');
    const complex = scoreComplexity(
      'What material has tensile strength above 10,000 psi and temperature resistance above 500F with FDA compliance and a PV limit between 20,000 and 30,000?'
    );
    assert.ok(complex > simple, `Expected ${complex} > ${simple}`);
  });

  it('increases score for depth markers like "why" and "explain"', () => {
    const basic = scoreComplexity('What is creep?');
    const deep = scoreComplexity('Why does creep occur and explain the failure modes in detail?');
    assert.ok(deep > basic, `Expected ${deep} > ${basic}`);
  });

  it('increases score when RAG context is large', () => {
    const noContext = scoreComplexity('Compare Torlon vs PEEK');
    const bigContext = scoreComplexity('Compare Torlon vs PEEK', 'x'.repeat(6000));
    assert.ok(bigContext > noContext, `Expected ${bigContext} > ${noContext}`);
  });

  it('accepts object RAG context (serializes to JSON for length check)', () => {
    const chunks = Array.from({ length: 50 }, (_, i) => ({
      text: `Chunk ${i} with some data about material properties and compliance information`,
    }));
    const score = scoreComplexity('What material should I use?', chunks);
    assert.ok(score >= 2, `Expected score >= 2 with large RAG context, got ${score}`);
  });

  it('always returns integer between 1 and 5', () => {
    const cases = [
      ['', null],
      [null, null],
      ['simple', null],
      ['a '.repeat(100), 'x'.repeat(10000)],
      ['and but with under above between limit and but with under above between limit explain why analyze detailed', 'x'.repeat(6000)],
    ];
    for (const [q, ctx] of cases) {
      const score = scoreComplexity(q, ctx);
      assert.ok(Number.isInteger(score), `Expected integer, got ${score}`);
      assert.ok(score >= 1 && score <= 5, `Expected 1-5, got ${score}`);
    }
  });

  it('returns 1 for null/undefined input', () => {
    assert.equal(scoreComplexity(null), 1);
    assert.equal(scoreComplexity(undefined), 1);
  });
});
