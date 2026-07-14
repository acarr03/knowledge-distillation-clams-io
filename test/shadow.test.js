const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { anthropicToOllamaMessages, extractClaudeText } = require('../src/shadow.js');

describe('anthropicToOllamaMessages', () => {
  it('prepends a system message from a plain string', () => {
    const out = anthropicToOllamaMessages({
      system: 'You are a materials engineer.',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    assert.deepEqual(out[0], { role: 'system', content: 'You are a materials engineer.' });
    assert.equal(out.length, 2);
  });

  it('joins text blocks from an array-form system field', () => {
    const out = anthropicToOllamaMessages({
      system: [
        { type: 'text', text: 'Line 1' },
        { type: 'text', text: 'Line 2' },
      ],
      messages: [{ role: 'user', content: 'Q' }],
    });
    assert.equal(out[0].content, 'Line 1\nLine 2');
  });

  it('omits the system message when system is absent', () => {
    const out = anthropicToOllamaMessages({
      messages: [{ role: 'user', content: 'Q' }],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].role, 'user');
  });

  it('passes through string message content', () => {
    const out = anthropicToOllamaMessages({
      messages: [{ role: 'user', content: 'Compare PEEK vs PTFE' }],
    });
    assert.deepEqual(out, [{ role: 'user', content: 'Compare PEEK vs PTFE' }]);
  });

  it('concatenates text blocks and drops tool_use / tool_result blocks', () => {
    const out = anthropicToOllamaMessages({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me look that up.' },
            { type: 'tool_use', id: 't1', name: 'search', input: { q: 'PEEK' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'PEEK data...' },
            { type: 'text', text: 'Thanks, now summarize.' },
          ],
        },
      ],
    });
    assert.deepEqual(out, [
      { role: 'assistant', content: 'Let me look that up.' },
      { role: 'user', content: 'Thanks, now summarize.' },
    ]);
  });

  it('skips messages that carry no textual content (tool-only turns)', () => {
    const out = anthropicToOllamaMessages({
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 's', input: {} }] },
        { role: 'user', content: 'Real question' },
      ],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].content, 'Real question');
  });

  it('normalizes unknown roles to user, keeps assistant', () => {
    const out = anthropicToOllamaMessages({
      messages: [
        { role: 'assistant', content: 'A' },
        { role: 'user', content: 'B' },
      ],
    });
    assert.equal(out[0].role, 'assistant');
    assert.equal(out[1].role, 'user');
  });

  it('handles empty / missing input gracefully', () => {
    assert.deepEqual(anthropicToOllamaMessages(), []);
    assert.deepEqual(anthropicToOllamaMessages({}), []);
    assert.deepEqual(anthropicToOllamaMessages({ messages: [] }), []);
  });
});

describe('extractClaudeText', () => {
  it('joins text blocks and ignores non-text blocks', () => {
    const response = {
      content: [
        { type: 'text', text: 'First.' },
        { type: 'tool_use', id: 't1', name: 'x', input: {} },
        { type: 'text', text: 'Second.' },
      ],
    };
    assert.equal(extractClaudeText(response), 'First.\nSecond.');
  });

  it('returns null when there is no text content', () => {
    assert.equal(extractClaudeText({ content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] }), null);
    assert.equal(extractClaudeText({}), null);
    assert.equal(extractClaudeText(null), null);
  });
});
