# Pipeline Implementation Reference

Reference code for all distillation pipeline components. All code aligned to decisions in `../CLAUDE.md`.

---

## Component 1: Interaction Logger

### Database Schema (PostgreSQL)

```sql
CREATE TABLE interactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Input Context
    user_query      TEXT NOT NULL,
    rag_context     JSONB,           -- retrieved chunks from vector library
    material_context JSONB,          -- material records pulled from library
    compliance_context JSONB,        -- any compliance docs referenced
    system_prompt   TEXT,            -- the system prompt used
    conversation_id UUID,            -- thread tracking

    -- Sonnet Output
    sonnet_response TEXT NOT NULL,
    sonnet_model    VARCHAR(50),     -- exact model version
    sonnet_tokens_in  INTEGER,
    sonnet_tokens_out INTEGER,
    sonnet_latency_ms INTEGER,
    sonnet_cost     DECIMAL(10,6),

    -- Local Model Output (Phase 2+)
    local_response  TEXT,
    local_model     VARCHAR(100),    -- e.g. "qwen3.5-35b-a3b-clams-v1"
    local_latency_ms INTEGER,

    -- Classification
    query_category  VARCHAR(50),     -- see categories below
    query_complexity INTEGER,        -- 1-5 scale

    -- Curation
    user_rating     INTEGER,         -- thumbs up/down from UI
    engineer_reviewed BOOLEAN DEFAULT FALSE,
    engineer_approved BOOLEAN DEFAULT FALSE,
    engineer_edited_response TEXT,   -- corrected version if needed
    review_notes    TEXT,

    -- Evaluation Scores (Phase 2+)
    similarity_score DECIMAL(5,4),   -- cosine similarity sonnet vs local
    factual_accuracy BOOLEAN,        -- did local model get facts right
    format_match    BOOLEAN,         -- did it follow output structure
    divergence_notes TEXT            -- where/why local model differed
);

CREATE INDEX idx_interactions_category ON interactions(query_category);
CREATE INDEX idx_interactions_reviewed ON interactions(engineer_reviewed);
CREATE INDEX idx_interactions_approved ON interactions(engineer_approved);
CREATE INDEX idx_interactions_created ON interactions(created_at);
CREATE INDEX idx_interactions_complexity ON interactions(query_complexity);
CREATE INDEX idx_interactions_conversation ON interactions(conversation_id);

-- View: training-ready examples with engineer approval
CREATE VIEW training_ready AS
SELECT
    id, user_query, rag_context, material_context,
    compliance_context, system_prompt,
    COALESCE(engineer_edited_response, sonnet_response) AS response,
    query_category, query_complexity, review_notes
FROM interactions
WHERE engineer_approved = TRUE
  AND query_category IS NOT NULL;
```

### Query Categories

```
material_lookup           → "What's the tensile strength of Vespel SP-1?"
comparison                → "Compare Torlon 4301 vs PEEK for bearing apps"
multi_constraint_selection → "What material for 300°F, FDA, PV 25K?"
calculation               → "Calculate the PV limit for this application"
compliance_check          → "Is this material RoHS compliant?"
document_search           → "Find datasheets mentioning chemical resistance"
general_engineering       → "Explain creep in polymers"
unit_conversion           → "Convert 14.5 MPa to psi"
```

### Logging Middleware (Node.js)

```javascript
// distillation/llmLogger.js

async function logInteraction({
  userQuery,
  ragContext,
  materialContext,
  complianceContext,
  systemPrompt,
  conversationId,
  sonnetResponse,
  sonnetModel,
  tokensIn,
  tokensOut,
  latencyMs,
  cost
}) {
  const category = classifyQuery(userQuery);
  const complexity = scoreComplexity(userQuery, ragContext);

  await db.query(`
    INSERT INTO interactions (
      user_query, rag_context, material_context,
      compliance_context, system_prompt, conversation_id,
      sonnet_response, sonnet_model, sonnet_tokens_in,
      sonnet_tokens_out, sonnet_latency_ms, sonnet_cost,
      query_category, query_complexity
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  `, [
    userQuery, ragContext, materialContext,
    complianceContext, systemPrompt, conversationId,
    sonnetResponse, sonnetModel, tokensIn,
    tokensOut, latencyMs, cost,
    category, complexity
  ]);
}

// Keyword-based classifier (upgrade to ML later)
function classifyQuery(query) {
  const q = query.toLowerCase();
  if (q.includes('compare') || q.includes('vs') || q.includes('versus'))
    return 'comparison';
  if (q.includes('convert') || q.includes('psi') || q.includes('mpa'))
    return 'unit_conversion';
  if (q.includes('complian') || q.includes('rohs') || q.includes('fda'))
    return 'compliance_check';
  if (q.includes('calculate') || q.includes('pv limit'))
    return 'calculation';
  if (q.includes('what material') || q.includes('recommend') || q.includes('suggest'))
    return 'multi_constraint_selection';
  if (q.includes('find') || q.includes('search') || q.includes('show me'))
    return 'document_search';
  if (q.match(/what('s| is) the .*(strength|modulus|temperature|density)/))
    return 'material_lookup';
  return 'general_engineering';
}

function scoreComplexity(query, ragContext) {
  let score = 1;
  const constraintWords = ['and', 'but', 'with', 'under', 'above', 'between', 'limit'];
  constraintWords.forEach(w => { if (query.toLowerCase().includes(w)) score++; });
  if (ragContext && ragContext.length > 3) score++;
  return Math.min(score, 5);
}

module.exports = { logInteraction, classifyQuery, scoreComplexity };
```

---

## Component 2: Training Dataset Builder

### Export Script (Python)

```python
# scripts/build_training_data.py

import json
import psycopg2
from datetime import datetime

DEFAULT_SYSTEM_PROMPT = """You are CLAMS, a materials engineering AI assistant.
You help engineers find, compare, and select materials based on technical
datasheets, compliance documents, and engineering requirements.
Always cite your sources. Be precise with property values and units.
If you're uncertain, say so clearly."""


def export_training_dataset(
    db_url,
    min_rating=None,
    categories=None,
    min_complexity=None,
    reviewed_only=True,
    output_path="training_data.jsonl"
):
    """
    Export curated interaction pairs as JSONL for fine-tuning.
    Queries the training_ready view by default (engineer-approved only).
    """
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Use the training_ready view for approved, curated examples
    query = """
        SELECT
            user_query, rag_context, material_context,
            compliance_context, system_prompt,
            response, query_category, query_complexity
        FROM training_ready
        WHERE 1=1
    """
    params = []

    if categories:
        query += " AND query_category = ANY(%s)"
        params.append(categories)

    if min_complexity:
        query += " AND query_complexity >= %s"
        params.append(min_complexity)

    cur.execute(query, params)
    rows = cur.fetchall()

    training_examples = []
    for row in rows:
        (user_query, rag_ctx, mat_ctx, comp_ctx,
         sys_prompt, response, category, complexity) = row

        context_parts = []
        if rag_ctx:
            context_parts.append(f"Retrieved Documents:\n{json.dumps(rag_ctx, indent=2)}")
        if mat_ctx:
            context_parts.append(f"Material Data:\n{json.dumps(mat_ctx, indent=2)}")
        if comp_ctx:
            context_parts.append(f"Compliance Records:\n{json.dumps(comp_ctx, indent=2)}")

        full_context = "\n\n".join(context_parts)

        example = {
            "messages": [
                {
                    "role": "system",
                    "content": sys_prompt or DEFAULT_SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": f"{full_context}\n\nUser Question: {user_query}"
                         if full_context else user_query
                },
                {
                    "role": "assistant",
                    "content": response
                }
            ],
            "metadata": {
                "category": category,
                "complexity": complexity,
                "source": "sonnet_distillation"
            }
        }
        training_examples.append(example)

    with open(output_path, 'w') as f:
        for ex in training_examples:
            f.write(json.dumps(ex) + '\n')

    print(f"Exported {len(training_examples)} training examples to {output_path}")
    conn.close()
    return len(training_examples)
```

### Curation Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────┐
│  CLAMS Training Data Curator                            │
│─────────────────────────────────────────────────────────│
│                                                         │
│  Filter: [Category ▼] [Complexity ▼] [Rating ▼]        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Query: "Compare Torlon 4301 vs PEEK for         │    │
│  │         high-temp bearing at 500°F"              │    │
│  │                                                  │    │
│  │ Category: comparison  Complexity: 4              │    │
│  │                                                  │    │
│  │ Sonnet Response:                                 │    │
│  │ ┌──────────────────────────────────────────────┐ │    │
│  │ │ For a high-temperature bearing at 500°F...   │ │    │
│  │ │ [full response displayed]                    │ │    │
│  │ └──────────────────────────────────────────────┘ │    │
│  │                                                  │    │
│  │ Quality:  [★★★★★]   Include in Training: [✓]    │    │
│  │ Notes: [Excellent multi-constraint reasoning   ] │    │
│  │                                                  │    │
│  │ [Approve] [Edit Response] [Reject] [Flag]        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Stats: 3,247 logged | 2,891 approved | 156 rejected    │
│  Categories: lookup 41% | comparison 23% | selection 18% │
└─────────────────────────────────────────────────────────┘
```

---

## Component 3: Shadow Testing & Evaluation

### Shadow Mode Runner (Node.js)

```javascript
// evaluation/shadowRunner.js

async function shadowQuery({ query, context, conversationId }) {
  // Always call Sonnet (the "teacher")
  const sonnetStart = Date.now();
  const sonnetResult = await callSonnet({ query, context, conversationId });
  const sonnetLatency = Date.now() - sonnetStart;

  // Simultaneously call local model (the "student")
  let localResult = null;
  let localLatency = null;

  try {
    const localStart = Date.now();
    localResult = await callLocalModel({ query, context, conversationId });
    localLatency = Date.now() - localStart;
  } catch (err) {
    console.error('Local model error:', err);
  }

  // Evaluate if local model produced a response
  let evaluation = null;
  if (localResult) {
    evaluation = await evaluateResponses(
      query, context, sonnetResult, localResult
    );
  }

  // Log everything
  await logInteraction({
    userQuery: query,
    ragContext: context.ragChunks,
    materialContext: context.materials,
    complianceContext: context.compliance,
    systemPrompt: context.systemPrompt,
    conversationId,
    sonnetResponse: sonnetResult.text,
    sonnetModel: sonnetResult.model,
    tokensIn: sonnetResult.usage.input_tokens,
    tokensOut: sonnetResult.usage.output_tokens,
    latencyMs: sonnetLatency,
    cost: calculateCost(sonnetResult.usage),
    localResponse: localResult?.text,
    localModel: localResult?.model,
    localLatencyMs: localLatency,
    similarityScore: evaluation?.similarity,
    factualAccuracy: evaluation?.factuallyCorrect,
    formatMatch: evaluation?.formatMatch,
    divergenceNotes: evaluation?.notes
  });

  // Always return Sonnet's response during shadow phase
  return sonnetResult;
}

// Call local model via Ollama API (OpenAI-compatible)
async function callLocalModel({ query, context, conversationId }) {
  const response = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-35b-a3b-clams',  // fine-tuned model name
      messages: buildMessages(query, context),
      temperature: 0.3,
      max_tokens: 4096
    })
  });
  return response.json();
}

module.exports = { shadowQuery };
```

### Automated Evaluation (Python)

```python
# evaluation/evaluate.py

import re
import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')


def evaluate_responses(query, context, sonnet_response, local_response):
    """
    Compare local model output against Sonnet's "gold standard."
    Returns structured evaluation metrics.
    """
    results = {}

    # 1. Semantic similarity
    sonnet_embedding = model.encode(sonnet_response)
    local_embedding = model.encode(local_response)
    similarity = np.dot(sonnet_embedding, local_embedding) / (
        np.linalg.norm(sonnet_embedding) * np.linalg.norm(local_embedding)
    )
    results['similarity'] = float(similarity)

    # 2. Key fact extraction check
    sonnet_values = extract_numeric_values(sonnet_response)
    local_values = extract_numeric_values(local_response)
    results['factually_correct'] = check_value_alignment(
        sonnet_values, local_values
    )

    # 3. Format compliance
    results['format_match'] = check_format_compliance(
        sonnet_response, local_response
    )

    # 4. Citation accuracy
    results['has_citations'] = bool(
        re.search(r'source|reference|datasheet|per\s', local_response.lower())
    )

    # 5. Promotion readiness flag
    results['promotion_ready'] = (
        results['similarity'] > 0.92 and
        results['factually_correct'] and
        results['format_match']
    )

    return results


def extract_numeric_values(text):
    """Pull out all numbers with their units for comparison."""
    pattern = r'(\d[\d,]*\.?\d*)\s*(MPa|psi|°[FC]|GPa|ksi|lb|kg|mm|in|%)'
    matches = re.findall(pattern, text)
    return {f"{v} {u}" for v, u in matches}


def check_value_alignment(sonnet_values, local_values):
    """
    Are the key numeric values in the local response
    consistent with Sonnet's response?
    At least 80% of Sonnet's cited values should appear in local.
    """
    if not sonnet_values:
        return True
    overlap = sonnet_values.intersection(local_values)
    return len(overlap) / len(sonnet_values) >= 0.8


def check_format_compliance(sonnet_response, local_response):
    """Check structural similarity between responses."""
    # Compare heading structure, list usage, paragraph count
    sonnet_has_lists = bool(re.search(r'^\s*[-•*]\s', sonnet_response, re.MULTILINE))
    local_has_lists = bool(re.search(r'^\s*[-•*]\s', local_response, re.MULTILINE))

    sonnet_has_headings = bool(re.search(r'^#+\s', sonnet_response, re.MULTILINE))
    local_has_headings = bool(re.search(r'^#+\s', local_response, re.MULTILINE))

    return (sonnet_has_lists == local_has_lists) and (sonnet_has_headings == local_has_headings)
```

---

## Component 4: Smart Router (Phase 3)

```javascript
// distillation/queryRouter.js

class QueryRouter {
  constructor() {
    // Per-category thresholds from CLAUDE.md
    this.thresholds = {
      material_lookup:           { minAccuracy: 0.95, minSimilarity: 0.94 },
      unit_conversion:           { minAccuracy: 0.99, minSimilarity: 0.97 },
      comparison:                { minAccuracy: 0.90, minSimilarity: 0.90 },
      compliance_check:          { minAccuracy: 0.95, minSimilarity: 0.92 },
      multi_constraint_selection:{ minAccuracy: 0.85, minSimilarity: 0.88 },
      calculation:               { minAccuracy: 0.95, minSimilarity: 0.93 },
      document_search:           { minAccuracy: 0.90, minSimilarity: 0.90 },
      general_engineering:       { minAccuracy: 0.85, minSimilarity: 0.88 },
    };

    // Loaded from evaluation database
    this.categoryPerformance = {};
  }

  async route(query, context) {
    const category = classifyQuery(query);
    const complexity = scoreComplexity(query, context);
    const performance = this.categoryPerformance[category];

    const decision = this.decide(category, complexity, performance);

    console.log(`[Router] ${category} | complexity:${complexity} → ${decision.target}`);

    if (decision.target === 'local') {
      const result = await callLocalModel({ query, context });

      // 10% spot-check for ongoing evaluation
      if (Math.random() < 0.10) {
        this.spotCheck(query, context, result);
      }

      return result;
    }

    return await callSonnet({ query, context });
  }

  decide(category, complexity, performance) {
    const threshold = this.thresholds[category];

    if (!performance || performance.sampleSize < 50) {
      return { target: 'sonnet', reason: 'insufficient_data' };
    }

    if (complexity >= 4) {
      return { target: 'sonnet', reason: 'high_complexity' };
    }

    if (
      performance.accuracy >= threshold.minAccuracy &&
      performance.avgSimilarity >= threshold.minSimilarity
    ) {
      return { target: 'local', reason: 'meets_threshold' };
    }

    return { target: 'sonnet', reason: 'below_threshold' };
  }

  async spotCheck(query, context, localResult) {
    const sonnetResult = await callSonnet({ query, context });
    const evaluation = await evaluateResponses(
      query, context, sonnetResult.text, localResult.text
    );

    await logSpotCheck({
      query, category: classifyQuery(query),
      localResponse: localResult.text,
      sonnetResponse: sonnetResult.text,
      evaluation
    });

    if (evaluation.similarity < 0.80 || !evaluation.factually_correct) {
      console.warn(`[Router] QUALITY ALERT: Local model diverged on: ${query}`);
    }
  }
}

module.exports = { QueryRouter };
```

---

## Key Tools

| Component | Tool | Purpose |
|-----------|------|---------|
| Local LLM serving | Ollama | Run Qwen3.5-35B-A3B with OpenAI-compatible API |
| Fine-tuning | Unsloth | QLoRA fine-tuning optimized for Apple Silicon |
| Base model | Qwen3.5-35B-A3B | MoE (35B total, 3B active), Apache 2.0 |
| Embeddings eval | sentence-transformers | Semantic similarity scoring |
| Training format | JSONL (chat format) | Standard fine-tune input |
| Database | PostgreSQL 16.12 | `clams_distillation` database |
