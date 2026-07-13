const express = require('express');
const { query } = require('../../src/db');
const router = express.Router();

// GET /api/orgs — Distinct organizations for dropdown
router.get('/orgs', async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT org_id, org_name
       FROM interactions
       WHERE org_id IS NOT NULL
       ORDER BY org_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[api/orgs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users — Distinct users (by email) for dropdown
router.get('/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT user_email, MAX(org_name) AS org_name, COUNT(*)::int AS interactions
       FROM interactions
       WHERE user_email IS NOT NULL
       GROUP BY user_email
       ORDER BY user_email`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[api/users]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats — Overview statistics
router.get('/stats', async (req, res) => {
  try {
    const { org, user } = req.query;
    const _conds = [];
    const _params = [];
    if (org) { _params.push(org); _conds.push(`org_id = $${_params.length}`); }
    if (user) { _params.push(user); _conds.push(`user_email = $${_params.length}`); }
    const orgFilter = _conds.length ? `WHERE ${_conds.join(' AND ')}` : '';
    const orgFilterAnd = _conds.length ? `AND ${_conds.join(' AND ')}` : '';
    const orgParams = _params;

    const [totals, categories, daily] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE engineer_reviewed)::int AS reviewed,
          COUNT(*) FILTER (WHERE engineer_approved)::int AS approved,
          COUNT(*) FILTER (WHERE NOT engineer_reviewed)::int AS unreviewed,
          COUNT(DISTINCT conversation_id)::int AS conversations,
          ROUND(AVG(query_complexity), 1) AS avg_complexity,
          ROUND(SUM(sonnet_cost)::numeric, 2) AS total_cost
        FROM interactions
        ${orgFilter}
      `, orgParams),
      query(`
        SELECT query_category AS category, COUNT(*)::int AS count
        FROM interactions
        WHERE query_category IS NOT NULL ${orgFilterAnd}
        GROUP BY query_category
        ORDER BY count DESC
      `, orgParams),
      query(`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS count
        FROM interactions
        WHERE created_at >= NOW() - INTERVAL '30 days' ${orgFilterAnd}
        GROUP BY DATE(created_at)
        ORDER BY day
      `, orgParams),
    ]);

    res.json({
      ...totals.rows[0],
      categories: categories.rows,
      daily: daily.rows,
    });
  } catch (err) {
    console.error('[api/stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/interactions — Flat, filtered, paginated list (drill-down / debugging)
router.get('/interactions', async (req, res) => {
  try {
    const {
      category, reviewed, approved, complexity, source, org, user,
      search, from, to, page = 1, limit = 25,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (category) { conditions.push(`query_category = $${idx++}`); params.push(category); }
    if (reviewed !== undefined) { conditions.push(`engineer_reviewed = $${idx++}`); params.push(reviewed === 'true'); }
    if (approved !== undefined) { conditions.push(`engineer_approved = $${idx++}`); params.push(approved === 'true'); }
    if (complexity) { conditions.push(`query_complexity = $${idx++}`); params.push(parseInt(complexity, 10)); }
    if (source) { conditions.push(`source = $${idx++}`); params.push(source); }
    if (org) { conditions.push(`org_id = $${idx++}`); params.push(org); }
    if (user) { conditions.push(`user_email = $${idx++}`); params.push(user); }
    if (search) { conditions.push(`user_query ILIKE $${idx++}`); params.push(`%${search}%`); }
    if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`created_at <= $${idx++}::date + INTERVAL '1 day'`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT id, conversation_id, LEFT(user_query, 120) AS query_preview, query_category,
                query_complexity, engineer_reviewed, engineer_approved,
                sonnet_cost, created_at, source, org_name, user_email
         FROM interactions ${where}
         ORDER BY id DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit, 10), offset],
      ),
      query(`SELECT COUNT(*)::int AS total FROM interactions ${where}`, params),
    ]);

    res.json({
      interactions: rows.rows,
      total: countResult.rows[0].total,
      page: parseInt(page, 10),
      pages: Math.ceil(countResult.rows[0].total / parseInt(limit, 10)),
    });
  } catch (err) {
    console.error('[api/interactions]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/interactions/:id — Full single interaction detail
router.get('/interactions/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM interactions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[api/interactions/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/interactions/:id/review — Update review fields on a single interaction
router.put('/interactions/:id/review', async (req, res) => {
  try {
    const { engineer_reviewed, engineer_approved, engineer_edited_response, review_notes } = req.body;
    const result = await query(
      `UPDATE interactions
       SET engineer_reviewed = COALESCE($1, engineer_reviewed),
           engineer_approved = COALESCE($2, engineer_approved),
           engineer_edited_response = COALESCE($3, engineer_edited_response),
           review_notes = COALESCE($4, review_notes)
       WHERE id = $5
       RETURNING id, engineer_reviewed, engineer_approved`,
      [engineer_reviewed, engineer_approved, engineer_edited_response, review_notes, req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[api/review]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations — Conversations grouped by conversation_id (primary curation list)
router.get('/conversations', async (req, res) => {
  try {
    const {
      org, user, source, reviewed, approved, category,
      search, from, to, page = 1, limit = 25,
    } = req.query;

    // Row-level filters (applied inside the group) — org/user/source are constant per conversation
    const rowConds = ['conversation_id IS NOT NULL'];
    const params = [];
    let idx = 1;
    if (org) { rowConds.push(`org_id = $${idx++}`); params.push(org); }
    if (user) { rowConds.push(`user_email = $${idx++}`); params.push(user); }
    if (source) { rowConds.push(`source = $${idx++}`); params.push(source); }
    if (from) { rowConds.push(`created_at >= $${idx++}`); params.push(from); }
    if (to) { rowConds.push(`created_at <= $${idx++}::date + INTERVAL '1 day'`); params.push(to); }
    // "any turn matches" filters
    if (search) { rowConds.push(`conversation_id IN (SELECT conversation_id FROM interactions WHERE user_query ILIKE $${idx++})`); params.push(`%${search}%`); }
    if (category) { rowConds.push(`conversation_id IN (SELECT conversation_id FROM interactions WHERE query_category = $${idx++})`); params.push(category); }

    // Conversation-level (aggregate) status filters
    const outerConds = [];
    if (approved !== undefined) { outerConds.push(`all_approved = $${idx++}`); params.push(approved === 'true'); }
    if (reviewed !== undefined) { outerConds.push(`all_reviewed = $${idx++}`); params.push(reviewed === 'true'); }

    const whereRow = `WHERE ${rowConds.join(' AND ')}`;
    const whereOuter = outerConds.length ? `WHERE ${outerConds.join(' AND ')}` : '';
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const cte = `
      WITH convo AS (
        SELECT
          conversation_id,
          COUNT(*)::int AS turns,
          MAX(id) AS last_id,
          (array_agg(user_query ORDER BY id))[1] AS first_query,
          MAX(user_email) AS user_email,
          MAX(org_name) AS org_name,
          MAX(source) AS source,
          MIN(created_at) AS started,
          bool_and(engineer_reviewed) AS all_reviewed,
          bool_and(engineer_approved) AS all_approved,
          COUNT(*) FILTER (WHERE engineer_approved)::int AS approved_turns,
          ROUND(SUM(sonnet_cost)::numeric, 4) AS cost,
          (array_agg(query_category ORDER BY id) FILTER (WHERE query_category IS NOT NULL))[1] AS category
        FROM interactions ${whereRow}
        GROUP BY conversation_id
      )`;

    const listSql = `${cte}
      SELECT conversation_id, turns, LEFT(first_query, 130) AS first_query, user_email,
             org_name, source, started, all_reviewed, all_approved, approved_turns, cost, category
      FROM convo ${whereOuter}
      ORDER BY last_id DESC
      LIMIT $${idx++} OFFSET $${idx++}`;
    const countSql = `${cte} SELECT COUNT(*)::int AS total FROM convo ${whereOuter}`;

    const [rows, countResult] = await Promise.all([
      query(listSql, [...params, parseInt(limit, 10), offset]),
      query(countSql, params),
    ]);

    res.json({
      conversations: rows.rows,
      total: countResult.rows[0].total,
      page: parseInt(page, 10),
      pages: Math.ceil(countResult.rows[0].total / parseInt(limit, 10)),
    });
  } catch (err) {
    console.error('[api/conversations]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:cid — All turns of one conversation, in order
router.get('/conversations/:cid', async (req, res) => {
  try {
    const cid = req.params.cid;
    const turns = await query(
      `SELECT id, user_query, rag_context, material_context, compliance_context,
              sonnet_response, engineer_edited_response, engineer_reviewed, engineer_approved,
              review_notes, query_category, query_complexity, sonnet_model,
              sonnet_tokens_in, sonnet_tokens_out, sonnet_cost, sonnet_latency_ms, created_at
       FROM interactions WHERE conversation_id = $1 ORDER BY id`,
      [cid],
    );
    if (turns.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const meta = await query(
      `SELECT MAX(user_email) AS user_email, MAX(org_name) AS org_name,
              MAX(source) AS source, MIN(created_at) AS started
       FROM interactions WHERE conversation_id = $1`,
      [cid],
    );

    res.json({ conversation_id: cid, meta: meta.rows[0], turns: turns.rows });
  } catch (err) {
    console.error('[api/conversations/:cid]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/conversations/:cid/review — Approve/reject the whole conversation + per-turn edits
router.put('/conversations/:cid/review', async (req, res) => {
  try {
    const cid = req.params.cid;
    const { approved, review_notes, edits } = req.body; // edits: { "<turnId>": "<edited response>" }

    // Apply per-turn edited responses (blank clears the edit → falls back to Sonnet original)
    if (edits && typeof edits === 'object') {
      for (const [id, text] of Object.entries(edits)) {
        const val = text && String(text).trim() ? text : null;
        await query(
          `UPDATE interactions SET engineer_edited_response = $1 WHERE id = $2 AND conversation_id = $3`,
          [val, parseInt(id, 10), cid],
        );
      }
    }

    const result = await query(
      `UPDATE interactions
       SET engineer_reviewed = TRUE,
           engineer_approved = $1,
           review_notes = COALESCE($2, review_notes)
       WHERE conversation_id = $3
       RETURNING id`,
      [!!approved, review_notes ?? null, cid],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ conversation_id: cid, turns_updated: result.rows.length, approved: !!approved });
  } catch (err) {
    console.error('[api/conversations/:cid/review]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/training — Approved conversations as multi-turn JSONL training examples
router.get('/export/training', async (req, res) => {
  try {
    const { source, org, user } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (source) { conditions.push(`source = $${idx++}`); params.push(source); }
    if (org) { conditions.push(`org_id = $${idx++}`); params.push(org); }
    if (user) { conditions.push(`user_email = $${idx++}`); params.push(user); }

    let sql = 'SELECT * FROM training_ready';
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY conversation_id NULLS LAST, id';

    const result = await query(sql, params);

    // Group approved rows into conversations (rows without a conversation_id become single-turn examples)
    const groups = new Map();
    for (const row of result.rows) {
      const key = row.conversation_id || `__row_${row.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const lines = [];
    for (const turns of groups.values()) {
      const first = turns[0];
      const orgLabel = first.org_name || 'TriStar Plastics, LLC';
      const messages = [{
        role: 'system',
        content: `You are a materials engineering assistant for ${orgLabel}, specializing in engineered plastics and composites for demanding applications.`,
      }];
      for (const t of turns) {
        const userContent = [t.user_query];
        if (t.rag_context) userContent.push(`\n\nContext:\n${t.rag_context}`);
        if (t.material_context) userContent.push(`\n\nMaterial data:\n${t.material_context}`);
        if (t.compliance_context) userContent.push(`\n\nCompliance data:\n${t.compliance_context}`);
        messages.push({ role: 'user', content: userContent.join('') });
        messages.push({ role: 'assistant', content: t.response });
      }
      lines.push(JSON.stringify({
        messages,
        metadata: {
          conversation_id: first.conversation_id || null,
          turns: turns.length,
          category: first.query_category,
          complexity: first.query_complexity,
          source: first.source || 'chat',
          org_id: first.org_id || null,
          org_name: first.org_name || null,
          user_email: first.user_email || null,
        },
      }));
    }

    res.setHeader('Content-Type', 'application/jsonl');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="clams-training-${new Date().toISOString().slice(0, 10)}.jsonl"`,
    );
    res.send(lines.join('\n') + '\n');
  } catch (err) {
    console.error('[api/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== AI Chat test bench (local Ollama) — sandbox, NOT logged to the dataset =====
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

// GET /api/aichat/models — locally available Ollama models
router.get('/aichat/models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    if (!r.ok) throw new Error(`Ollama responded ${r.status}`);
    const d = await r.json();
    res.json({ models: (d.models || []).map((m) => m.name).sort() });
  } catch (err) {
    console.error('[api/aichat/models]', err.message);
    res.status(502).json({ error: `Ollama not reachable at ${OLLAMA}: ${err.message}` });
  }
});

// POST /api/aichat — stream a chat completion from the local model (NDJSON passthrough)
router.post('/aichat', async (req, res) => {
  try {
    const { model, messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] required' });
    }
    const upstream = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'qwen3.6:35b-a3b', messages, stream: true }),
    });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: `Ollama ${upstream.status}: ${text.slice(0, 200)}` });
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error('[api/aichat]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

module.exports = router;
