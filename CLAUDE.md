# CLAMS-IO Knowledge Distillation Pipeline

## Project Overview

This project builds a proprietary AI knowledge distillation pipeline for CLAMS-IO.DEV, a Materials Intelligence Platform for the engineered plastics and composites industry. The goal is to capture interactions with Claude Sonnet, curate them with human engineering expertise, and fine-tune a local open-source model (Qwen3.5-35B-A3B) to handle the majority of queries independently — reducing API costs, building defensible IP, and creating a competitive moat.

## Owner

Adrian Carrera — Mechanical/Materials Engineer at TriStar Plastics LLC (owned by Sky Peak Capital). Built CLAMS-IO independently using own time and resources. No IP assignment clause in employment contract.

## Hardware

- **Mac Studio M4 Max** — 16-Core CPU, 40-Core GPU, 64GB Unified Memory, 1TB SSD
- **Network**: 10Gb Ethernet via Cat 6a to Eero Max 7 (tested at 2.3 Gbps)
- **Local Model**: Qwen3.5-35B-A3B running via Ollama (~23GB, ~45 t/s on M4 Max)

## Tech Stack

- **Runtime**: Node.js v25.6.1
- **Python**: 3.9.6 (for ML pipeline, fine-tuning, evaluation)
- **Database**: PostgreSQL on Railway (production) + local PostgreSQL 16.12 (Homebrew) for dev
- **Local LLM**: Ollama + Qwen3.5-35B-A3B (Apache 2.0 license, full commercial freedom)
- **AI API**: Claude Sonnet 4.5 (current production model for CLAMS)
- **Claude Code**: v2.1.49
- **Fine-tuning**: Unsloth (optimized for Apple Silicon), QLoRA
- **Evaluation**: sentence-transformers for semantic similarity scoring

## Project Structure

```
~/Projects/clams-io/
├── CLAUDE.md               # Project knowledge file (this file)
├── docs/
│   └── pipeline-implementation.md  # Reference code & architecture for all components
├── src/                    # Core module: logger, classifier, cost, config, db
├── dashboard/              # Curation dashboard (Express + EJS, port 3847)
│   ├── server.js           # Entry point
│   ├── routes/api.js       # REST endpoints (stats, interactions, review, export)
│   ├── routes/pages.js     # Page routes (overview, list, review)
│   ├── views/              # EJS templates (layout, index, interactions, review)
│   └── public/app.js       # Client-side JS
├── fine-tuning/            # Training scripts, Unsloth configs, QLoRA setup
├── evaluation/             # Shadow testing, automated scoring, benchmarks
├── data/
│   ├── raw-logs/           # Raw interaction exports from PostgreSQL
│   ├── curated/            # Engineer-reviewed and approved examples
│   └── training-sets/      # JSONL files ready for fine-tuning
├── test/                   # Unit tests (classifier, complexity, cost, logger)
└── scripts/                # Utility scripts, export tools, maintenance
```

## Database Schema (Live)

Database: `clams_distillation` on local PostgreSQL

**Table: `interactions`** — Core logging table capturing every Sonnet query through CLAMS.

Fields:
- **Input**: user_query, rag_context, material_context, compliance_context, system_prompt, conversation_id
- **Sonnet output**: sonnet_response, sonnet_model, sonnet_tokens_in, sonnet_tokens_out, sonnet_latency_ms, sonnet_cost
- **Local model output** (Phase 2+): local_response, local_model, local_latency_ms
- **Classification**: query_category (8 types), query_complexity (1-5 scale)
- **Curation**: user_rating, engineer_reviewed, engineer_approved, engineer_edited_response, review_notes
- **Evaluation** (Phase 2+): similarity_score, factual_accuracy, format_match, divergence_notes

**Query categories**: material_lookup, comparison, multi_constraint_selection, calculation, compliance_check, document_search, general_engineering, unit_conversion

**View: `training_ready`** — Automatically filters to engineer-approved, categorized interactions. Uses COALESCE to prefer edited responses over raw Sonnet responses.

Indexes on: query_category, engineer_reviewed, engineer_approved, created_at, query_complexity, conversation_id.

## Distillation Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAMS-IO.DEV Platform                     │
│                                                             │
│  User Query ──►  Router / Classifier                        │
│                    │           │                             │
│              ┌─────┘           └─────┐                      │
│              ▼                       ▼                       │
│     ┌──────────────┐      ┌───────────────┐                 │
│     │  Sonnet 4.5  │      │  Local Model  │                 │
│     │  (Claude API) │      │ (Mac Studio)  │                 │
│     └──────┬───────┘      └──────┬────────┘                 │
│            │                      │                          │
│            ▼                      ▼                          │
│     ┌──────────────────────────────────┐                    │
│     │      Interaction Logger          │                    │
│     │  (captures all I/O pairs)        │                    │
│     └──────────────┬───────────────────┘                    │
│                    ▼                                         │
│     ┌──────────────────────────────────┐                    │
│     │    Training Dataset Builder      │                    │
│     └──────────────┬───────────────────┘                    │
│                    ▼                                         │
│     ┌──────────────────────────────────┐                    │
│     │   Evaluation & Shadow Testing    │                    │
│     └──────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### Phase 1: Passive Logging (Weeks 1-8)
- Build middleware that intercepts all CLAMS → Sonnet API calls
- Log every interaction to PostgreSQL with full context (query + RAG chunks + material data + compliance data)
- Auto-classify query category and complexity
- Build curation dashboard for reviewing/approving/editing interactions
- Target: 2,000+ logged interactions
- Cost: Normal Sonnet API spend (~$315/mo at 500 queries/day)

### Phase 2: Shadow Testing (Weeks 9-16)
- Fine-tune first local model on curated dataset using Unsloth/QLoRA
- Deploy shadow mode: both Sonnet and local model answer every query, only Sonnet served to user
- Automated evaluation: semantic similarity, key fact extraction, format compliance, citation accuracy
- Iterate on fine-tuning based on evaluation gaps
- Target: >90% similarity across categories
- Cost: Sonnet + Mac Studio electricity (~$12/mo)

### Phase 3: Smart Router (Weeks 17-24)
- Deploy smart router with per-category performance thresholds
- Easy categories go local first (unit_conversion, material_lookup, document_search)
- Complex queries stay on Sonnet
- 10% spot-check sampling for ongoing quality monitoring
- Target: 40-60% queries handled locally
- Cost: ~40-60% API savings

### Phase 4: Maturity (Week 25+)
- 80%+ queries local, Sonnet for complexity 4-5 and new patterns
- Continuous learning from hardest edge cases
- Target: 80-90% local, 10-20% Sonnet fallback
- Cost: ~80% API reduction

## Three Knowledge Sources

### 1. Sonnet Distillation
Every CLAMS query answered by Sonnet gets logged, reviewed, and curated into training pairs. The primary volume source.

### 2. Adrian's 12 Years of Industry Notes
Structured in Obsidian vault (TriStar) with folders for Materials, Applications, Compliance, etc. Already in .md format. These contain real-world engineering insights not found in datasheets — field performance, failure modes, material behavior under non-standard conditions, customer lessons learned.

Two paths:
- **RAG**: Load directly into CLAMS vector library for immediate retrieval
- **Fine-tuning**: Convert notes into Q&A training pairs (use Sonnet to generate realistic questions from notes, then curate)

### 3. Mentor Expert Knowledge
Structured interview sessions with industry veteran (30+ years experience). Recorded, transcribed, converted to training pairs. Captures decision-making frameworks, heuristics, and institutional knowledge that exists nowhere in published form.

## Key Technical Decisions

- **Qwen3.5-35B-A3B chosen over 70B dense models**: MoE architecture (35B total, 3B active) gives better speed (~45 t/s vs 8-12 t/s), lower memory footprint (~23GB vs 40GB), more RAG context headroom (~41GB free), multimodal support (text + image), 256K context window, and faster fine-tuning iterations. Quality gap narrows post-fine-tuning on domain-specific data.
- **Human-in-the-loop curation**: Every training example is reviewed, edited, and approved by an engineer before entering the training set. This makes the dataset legally defensible as "Adrian's curated materials engineering knowledge" rather than raw Sonnet output copies.
- **Apache 2.0 license**: Full commercial freedom. No revenue caps, no attribution requirements. Critical for equity asset.

## Smart Router Logic (Phase 3)

```
if insufficient_data_for_category → route to Sonnet
if query_complexity >= 4 → route to Sonnet
if category_accuracy >= threshold → route to local
if category_accuracy < threshold → route to Sonnet
10% random spot-check → both models, log comparison
```

Per-category thresholds (targets):
- material_lookup: 95% accuracy, 94% similarity
- unit_conversion: 99% accuracy, 97% similarity
- document_search: 90% accuracy, 90% similarity
- comparison: 90% accuracy, 90% similarity
- compliance_check: 95% accuracy, 92% similarity (higher bar due to liability)
- multi_constraint_selection: 85% accuracy, 88% similarity
- calculation: 95% accuracy, 93% similarity
- general_engineering: 85% accuracy, 88% similarity

## Training Data Format

JSONL with chat format for fine-tuning:

```json
{
  "messages": [
    {"role": "system", "content": "You are a materials engineering assistant for TriStar Plastics..."},
    {"role": "user", "content": "[query + RAG context + material context]"},
    {"role": "assistant", "content": "[curated engineer-approved response]"}
  ],
  "metadata": {
    "category": "material_lookup",
    "complexity": 3,
    "source": "sonnet_distillation"
  }
}
```

## What's Built (Phase 1)

1. **Interaction logger middleware** — `src/logger.js` intercepts CLAMS chat requests via `logInteractionAsync()`. Installed in the backend's `agent.js` route. Fire-and-forget, never blocks the user.
2. **Auto-classifier** — `src/classifier.js` tags query_category (8 types) and `src/complexity.js` scores query_complexity (1-5). Both run inline during logging.
3. **Token/cost tracking** — `materialAgent.js` accumulates `input_tokens` / `output_tokens` across all API calls in the LangGraph workflow and passes them to the logger, which auto-calculates `sonnet_cost`.
4. **Curation dashboard** — `dashboard/` — Express + EJS app on port 3847. Stats overview, filterable interaction list, detail review page (edit, approve, reject), JSONL training export.
5. **Training export** — `GET /api/export/training` endpoint exports the `training_ready` view as JSONL in chat format, ready for fine-tuning.

## What To Build Next

1. **Shadow testing framework** — Sends queries to both Sonnet and local model, runs automated evaluation, logs comparison scores.
2. **Smart router** — Decision engine that routes queries to local or Sonnet based on category performance thresholds.

## Cost Impact Projection

```
Current State (100% Sonnet 4.5):
├── ~500 queries/day across users
├── Avg ~2K input + 1K output tokens per query
├── Sonnet 4.5: $3/1M input, $15/1M output
├── Daily: ~$10.50/day → Monthly: ~$315/month → Annual: ~$3,780/year

Phase 3 (50% local routing):
├── Monthly Sonnet: ~$158 + Mac Studio: ~$12 = ~$170/month
└── Annual savings: ~$1,740/year

Phase 4 (80% local routing):
├── Monthly Sonnet: ~$63 + Mac Studio: ~$12 = ~$75/month
└── Annual savings: ~$2,880/year
```

## Business Context

CLAMS-IO.DEV is a Materials Intelligence Platform with: AI-powered PDF datasheet extraction, material library, vector library (RAG), compliance document management, AI chat interface, and embeddable customer widget. Currently live and functional at clams-io.dev.

The distillation pipeline creates five distinct IP assets:
1. Fine-tuned proprietary model
2. Curated training dataset (30K-50K examples by month 18)
3. Evaluation benchmark suite
4. Distillation pipeline infrastructure
5. Domain-specific RAG optimization

This transforms CLAMS from "platform using Claude" to "technology company with defensible AI asset" — critical for equity negotiations with Sky Peak Capital.

## IP & Terms of Service

Review Anthropic's Acceptable Use Policy before direct distillation. Three approaches ranked by legal defensibility:

1. **Human-in-the-loop curation** (chosen) — Every training example reviewed, edited, and approved by an engineer. Dataset = "Adrian's curated materials engineering knowledge" informed by Sonnet, not raw copies.
2. **Synthetic augmentation** — Use Sonnet outputs as inspiration to write variations in your own expert voice.
3. **Evaluation-only** — Train on your own datasheets/manuals/references. Use Sonnet purely as the evaluator/judge.

## Running the Curation Dashboard

```bash
# Option 1: Shell alias (already configured in ~/.zshrc)
clams-dash

# Option 2: macOS app (double-click)
# "CLAMS Dashboard.app" on Desktop or in /Applications

# Option 3: Manual
DISTILLATION_DATABASE_URL="<railway-url>" npm run dashboard
```

Opens at http://localhost:3847. Connects to the Railway Postgres database.

## Important Notes

- Never store API keys in code. Use environment variables.
- Keep this Mac Studio clean — project work only. Isolate experiments in their project folders.
- PostgreSQL is running as a Homebrew service (`brew services start postgresql@16`).
- Ollama runs as a background service after first launch.
- See `docs/pipeline-implementation.md` for reference code for all components.
- The Railway database URL is stored in the `clams-dash` shell alias and the macOS app. If the Railway DB credentials rotate, update both.
