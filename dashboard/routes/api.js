const express = require('express');
const { query } = require('../../src/db');
const router = express.Router();

// GET /api/stats — Overview statistics
router.get('/stats', async (req, res) => {
  try {
    const [totals, categories, daily] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE engineer_reviewed)::int AS reviewed,
          COUNT(*) FILTER (WHERE engineer_approved)::int AS approved,
          COUNT(*) FILTER (WHERE NOT engineer_reviewed)::int AS unreviewed,
          ROUND(AVG(query_complexity), 1) AS avg_complexity,
          ROUND(SUM(sonnet_cost)::numeric, 2) AS total_cost
        FROM interactions
      `),
      query(`
        SELECT query_category AS category, COUNT(*)::int AS count
        FROM interactions
        WHERE query_category IS NOT NULL
        GROUP BY query_category
        ORDER BY count DESC
      `),
      query(`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS count
        FROM interactions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY day
      `),
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

// GET /api/interactions — Filtered, paginated list
router.get('/interactions', async (req, res) => {
  try {
    const {
      category,
      reviewed,
      approved,
      complexity,
      source,
      search,
      from,
      to,
      page = 1,
      limit = 25,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (category) {
      conditions.push(`query_category = $${idx++}`);
      params.push(category);
    }
    if (reviewed !== undefined) {
      conditions.push(`engineer_reviewed = $${idx++}`);
      params.push(reviewed === 'true');
    }
    if (approved !== undefined) {
      conditions.push(`engineer_approved = $${idx++}`);
      params.push(approved === 'true');
    }
    if (complexity) {
      conditions.push(`query_complexity = $${idx++}`);
      params.push(parseInt(complexity, 10));
    }
    if (source) {
      conditions.push(`source = $${idx++}`);
      params.push(source);
    }
    if (search) {
      conditions.push(`user_query ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}::date + INTERVAL '1 day'`);
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT id, LEFT(user_query, 120) AS query_preview, query_category,
                query_complexity, engineer_reviewed, engineer_approved,
                sonnet_cost, created_at, source
         FROM interactions ${where}
         ORDER BY id DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit, 10), offset],
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM interactions ${where}`,
        params,
      ),
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

// GET /api/interactions/:id — Full interaction detail
router.get('/interactions/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM interactions WHERE id = $1', [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[api/interactions/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/interactions/:id/review — Update review fields
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

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[api/review]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/training — Download training_ready as JSONL
router.get('/export/training', async (req, res) => {
  try {
    const { source } = req.query;
    let sql = 'SELECT * FROM training_ready';
    const params = [];
    if (source) {
      sql += ' WHERE source = $1';
      params.push(source);
    }
    sql += ' ORDER BY id';
    const result = await query(sql, params);
    const lines = result.rows.map((row) => {
      const userContent = [row.user_query];
      if (row.rag_context) userContent.push(`\n\nContext:\n${row.rag_context}`);
      if (row.material_context) userContent.push(`\n\nMaterial data:\n${row.material_context}`);
      if (row.compliance_context) userContent.push(`\n\nCompliance data:\n${row.compliance_context}`);

      return JSON.stringify({
        messages: [
          {
            role: 'system',
            content:
              'You are a materials engineering assistant for TriStar Plastics, specializing in engineered plastics and composites for demanding applications.',
          },
          { role: 'user', content: userContent.join('') },
          { role: 'assistant', content: row.response },
        ],
        metadata: {
          id: row.id,
          category: row.query_category,
          complexity: row.query_complexity,
          source: row.source || 'chat',
        },
      });
    });

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

module.exports = router;
