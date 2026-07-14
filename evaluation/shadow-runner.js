#!/usr/bin/env node
/**
 * Offline shadow runner.
 *
 * Reads shadow_captures rows with status='captured', replays each captured
 * Claude request against the local model (Ollama), stores the local answer,
 * and flips the row to status='replayed'. Run on demand:
 *
 *   node evaluation/shadow-runner.js
 *
 * Never runs inside a customer request — this is a batch job. Automated semantic
 * similarity scoring (similarity_score, status='scored') is a documented
 * fast-follow; v1 leans on the engineer verdict in the dashboard.
 *
 * Env:
 *   DISTILLATION_DATABASE_URL  Postgres connection (see src/config.js)
 *   OLLAMA_URL                 Ollama host (default http://localhost:11434)
 *   SHADOW_LOCAL_MODEL         Local model tag (default qwen3.6:35b-a3b)
 *   SHADOW_BATCH_LIMIT         Max rows per run (default 50)
 */

const { query, closePool } = require('../src/db.js');
const { anthropicToOllamaMessages } = require('../src/shadow.js');

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.SHADOW_LOCAL_MODEL || 'qwen3.6:35b-a3b';
const BATCH_LIMIT = parseInt(process.env.SHADOW_BATCH_LIMIT || '50', 10);

async function replayOne(row) {
  const messages = anthropicToOllamaMessages({
    system: row.request_system,
    messages: row.request_messages, // JSONB → already parsed by pg
  });
  if (messages.length === 0) {
    console.warn(`  #${row.id}: no replayable text content — skipping`);
    return false;
  }

  const started = Date.now();
  const resp = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: false }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Ollama ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();

  const content = data.message && data.message.content ? data.message.content : null;
  const tokensOut = data.eval_count ?? null;
  const latencyMs = data.eval_duration != null
    ? Math.round(data.eval_duration / 1e6)
    : (Date.now() - started);

  await query(
    `UPDATE shadow_captures
     SET local_model = $1, local_response = $2, local_tokens_out = $3,
         local_latency_ms = $4, status = 'replayed'
     WHERE id = $5`,
    [MODEL, content, tokensOut, latencyMs, row.id],
  );
  return true;
}

async function main() {
  console.log(`[shadow-runner] Ollama=${OLLAMA} model=${MODEL} limit=${BATCH_LIMIT}`);
  const { rows } = await query(
    `SELECT id, request_system, request_messages
     FROM shadow_captures
     WHERE status = 'captured'
     ORDER BY id
     LIMIT $1`,
    [BATCH_LIMIT],
  );

  if (rows.length === 0) {
    console.log('[shadow-runner] No captured rows to replay.');
    return;
  }

  console.log(`[shadow-runner] Replaying ${rows.length} capture(s)...`);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const done = await replayOne(row);
      if (done) { ok++; console.log(`  #${row.id}: replayed`); }
    } catch (err) {
      failed++;
      console.error(`  #${row.id}: ${err.message}`);
    }
  }
  console.log(`[shadow-runner] Done. ${ok} replayed, ${failed} failed, ${rows.length - ok - failed} skipped.`);
}

main()
  .catch((err) => {
    console.error('[shadow-runner] Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
