-- Idempotent schema for the clams_distillation database.
-- Matches the live schema exactly. Safe to run on new environments.

CREATE TABLE IF NOT EXISTS interactions (
    id                       SERIAL PRIMARY KEY,
    created_at               TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),

    -- Input context
    user_query               TEXT NOT NULL,
    rag_context              TEXT,
    material_context         TEXT,
    compliance_context       TEXT,
    system_prompt            TEXT,
    conversation_id          TEXT,

    -- Sonnet output
    sonnet_response          TEXT,
    sonnet_model             TEXT DEFAULT 'claude-sonnet-4-5-20250514',
    sonnet_tokens_in         INTEGER,
    sonnet_tokens_out        INTEGER,
    sonnet_latency_ms        INTEGER,
    sonnet_cost              NUMERIC(10,6),

    -- Local model output (Phase 2+)
    local_response           TEXT,
    local_model              TEXT,
    local_latency_ms         INTEGER,

    -- Classification
    query_category           TEXT,
    query_complexity         INTEGER,

    -- Curation
    user_rating              INTEGER,
    engineer_reviewed        BOOLEAN DEFAULT FALSE,
    engineer_approved        BOOLEAN DEFAULT FALSE,
    engineer_edited_response TEXT,
    review_notes             TEXT,

    -- Evaluation scores (Phase 2+)
    similarity_score         NUMERIC(5,4),
    factual_accuracy         BOOLEAN,
    format_match             BOOLEAN,
    divergence_notes         TEXT,

    -- Organization
    org_id                   UUID,
    org_name                 TEXT,

    -- CHECK constraints
    CONSTRAINT interactions_query_category_check CHECK (
        query_category = ANY (ARRAY[
            'material_lookup', 'comparison', 'multi_constraint_selection',
            'calculation', 'compliance_check', 'document_search',
            'general_engineering', 'unit_conversion'
        ])
    ),
    CONSTRAINT interactions_query_complexity_check CHECK (
        query_complexity >= 1 AND query_complexity <= 5
    ),
    CONSTRAINT interactions_user_rating_check CHECK (
        user_rating >= 1 AND user_rating <= 5
    )
);

-- Indexes (IF NOT EXISTS requires PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS idx_interactions_category ON interactions(query_category);
CREATE INDEX IF NOT EXISTS idx_interactions_reviewed ON interactions(engineer_reviewed);
CREATE INDEX IF NOT EXISTS idx_interactions_approved ON interactions(engineer_approved);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_complexity ON interactions(query_complexity);
CREATE INDEX IF NOT EXISTS idx_interactions_conversation ON interactions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_interactions_org_id ON interactions(org_id);

-- View: training-ready examples with engineer approval
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
