-- Migration: failure-mode tags on shadow captures, for the failure-pattern tally.
-- Engineers tag each evaluated capture with recurring failure modes; the dashboard
-- aggregates tag -> count (+ verdict split) to show where fine-tuning will help most.
-- Run on both Railway (production) and local Postgres.

BEGIN;

ALTER TABLE shadow_captures ADD COLUMN IF NOT EXISTS failure_tags TEXT[];

-- GIN index for array membership / containment queries.
CREATE INDEX IF NOT EXISTS idx_shadow_failure_tags ON shadow_captures USING GIN (failure_tags);

COMMIT;
