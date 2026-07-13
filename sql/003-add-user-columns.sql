-- Migration: Add per-user attribution to the interactions table.
-- Run on both Railway (production) and local Postgres.
-- Existing rows predate user capture and stay NULL (no backfill here).

BEGIN;

-- Per-user attribution (backend passes req.user.id / req.user.email)
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS user_id    TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS user_email TEXT;

CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON interactions(user_id);

-- Recreate training_ready so conversation grouping + user attribution flow through to export.
-- DROP/CREATE (not CREATE OR REPLACE) so we can reorder columns (conversation_id moved up).
DROP VIEW IF EXISTS training_ready;
CREATE VIEW training_ready AS
SELECT
    id, conversation_id, user_query, rag_context, material_context,
    compliance_context, system_prompt,
    COALESCE(engineer_edited_response, sonnet_response) AS response,
    query_category, query_complexity, review_notes,
    source, org_id, org_name, user_id, user_email, created_at
FROM interactions
WHERE engineer_approved = TRUE
  AND query_category IS NOT NULL;

COMMIT;
