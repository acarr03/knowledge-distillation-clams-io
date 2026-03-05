-- Migration: Add organization awareness to interactions table
-- Run on both Railway (production) and local Postgres

BEGIN;

-- Add org columns
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS org_name TEXT;

-- Index for org-level filtering
CREATE INDEX IF NOT EXISTS idx_interactions_org_id ON interactions(org_id);

-- Note: No backfill. Existing interactions predate org awareness and stay unassigned.
-- New interactions will have org_id/org_name set by the logger.

-- Recreate view with org columns
CREATE OR REPLACE VIEW training_ready AS
SELECT
    id, user_query, rag_context, material_context,
    compliance_context, system_prompt,
    COALESCE(engineer_edited_response, sonnet_response) AS response,
    query_category, query_complexity, review_notes,
    source, org_id, org_name
FROM interactions
WHERE engineer_approved = TRUE
  AND query_category IS NOT NULL;

COMMIT;
