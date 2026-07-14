-- Migration: Add the shadow_captures table for Phase 2 shadow testing.
-- Run on both Railway (production) and local Postgres.
-- Captures the exact Claude request (assembled prompt + tools) and response,
-- so the local model can be replayed against identical context offline.
-- Nothing here touches the interactions table or training_ready view.

BEGIN;

CREATE TABLE IF NOT EXISTS shadow_captures (
    id                 SERIAL PRIMARY KEY,
    created_at         TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),

    -- Correlation (mirrors interactions attribution)
    conversation_id    TEXT,
    org_id             UUID,          -- matches interactions.org_id type
    org_name           TEXT,
    user_id            TEXT,
    user_email         TEXT,
    node               TEXT,          -- agent node the capture came from, e.g. 'basicResponse'

    -- Claude request (the "documents + plan + tools")
    request_model      TEXT,
    request_system     TEXT,
    request_messages   JSONB,
    request_tools      JSONB,
    thinking_enabled   BOOLEAN,

    -- Claude output
    claude_response    TEXT,
    claude_stop_reason TEXT,
    claude_tokens_in   INTEGER,
    claude_tokens_out  INTEGER,
    claude_latency_ms  INTEGER,

    -- Local replay (filled offline)
    local_model        TEXT,
    local_response     TEXT,
    local_latency_ms   INTEGER,
    local_tokens_out   INTEGER,

    -- Compare / curation
    similarity_score   NUMERIC(5,4),
    engineer_verdict   TEXT,          -- e.g. local_better | claude_better | equivalent | reject
    review_notes       TEXT,
    status             TEXT DEFAULT 'captured'  -- captured | replayed | scored
);

-- Indexes (IF NOT EXISTS requires PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS idx_shadow_captures_conversation ON shadow_captures(conversation_id);
CREATE INDEX IF NOT EXISTS idx_shadow_captures_status       ON shadow_captures(status);
CREATE INDEX IF NOT EXISTS idx_shadow_captures_org_id       ON shadow_captures(org_id);
CREATE INDEX IF NOT EXISTS idx_shadow_captures_created      ON shadow_captures(created_at);

COMMIT;
