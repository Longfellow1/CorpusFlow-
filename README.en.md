# CorpusFlow·指令微调数据工程平台

> **Turns fine-tuning data from a cottage industry into a production line — by locking down the semantic skeleton before scaling entities.**

CorpusFlow is an open-source data-engineering workbench for LLM fine-tuning corpora. It tackles the core tension in batch data generation — **hallucinations ruin quality, manual curation kills throughput** — with a **skeleton-first generation paradigm** plus a **closed loop** from production badcases back to the training set.

*[中文版 → README.md](README.md)*

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## Why this exists

Data quality is where LLM iteration stalls. Most teams hit the same wall:

- **Manual construction** is experience-driven, doesn't scale, and burns senior time on grunt work
- **Batch generation** drifts — semantic boundaries blur, key entities get dropped, hallucinations slip through
- **Production badcases** sit in logs for days before anyone turns them into training data

Pick two? You actually need all three: scale, control, and a live pipeline to production.

**CorpusFlow is the production line that gives you all three.**

---

## The paradigm: structural constraint

Constraint-free batch expansion hallucinates. Pure manual curation doesn't scale. The answer is to split generation into **two stages with different operators**:

```
  seed examples
      │
      ▼
  ┌────────────────────────────┐
  │  1. Semantic skeleton       │   ← Human-in-the-loop
  │     (syntactic abstraction) │     reviews & adjusts structure
  └──────────────┬──────────────┘
                 │  locked skeleton
                 ▼
  ┌────────────────────────────┐
  │  2. Entity fan-out          │   ← LLM does the volume
  │     (varied entities,       │     within fixed boundaries
  │      bounded by skeleton)   │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌────────────────────────────┐
  │  3. Quality gate            │   ← Entity consistency +
  │     (multi-dimensional)     │     semantic similarity checks
  └────────────────────────────┘
```

Humans own **structure** (where quality lives). LLMs own **volume** (where scale lives). The skeleton is derived using NLP-style syntactic abstraction — think of it as "grammar templates for meaning." Once locked, the batch fan-out cannot drift semantically or drop key entities.

This is the core innovation: **control and scale stop being a trade-off.**

---

## Task-driven, not prompt-driven

Instead of exposing prompt engineering to every user, three task templates cover the majority of real production needs:

| Task template | Input | Output |
|---|---|---|
| **Fine-tune augmentation** | Seed examples | Varied training data in the same format |
| **Eval set construction** | Topic / capability list | Diverse evaluation queries |
| **Badcase targeted augmentation** | A production badcase | Reinforcement examples around the failure mode |

Algorithm engineers and QA staff configure **business constraints**, not prompts. The underlying Workflow engineering is packaged into a task card that reads like a form.

---

## The upstream loop: badcase → training asset, in hours not days

CorpusFlow connects to an upstream dialog analysis platform to close the loop:

```
 Production conversations
      │
      ▼  risk / value scoring
 High-signal Q&A
      │
      ▼  structured as "semantic asset"
 One-click push ─────────► CorpusFlow
                                │
                                ▼  targeted fan-out
                         50 reinforcement examples
                                │
                                ▼
                         Training corpus
```

This turned the badcase-to-training cycle from **day-scale to hour-scale** — a Data-Centric AI loop that iterates at production speed.

---

## What it is, and what it refuses to be

| It **is** | It **refuses to be** |
|---|---|
| A production line with a paradigm behind it | A prompt playground |
| Human-in-the-loop where it matters (structure) | Human-in-the-loop everywhere (a sweatshop) |
| Closed-loop with production data | An isolated data factory |
| Whitebox & traceable (every step inspectable) | A black-box "AI magic" button |

---

## Impact (internal rollout)

- **3×+ generation efficiency** vs. manual prompting
- **90%+ human adoption rate** on first-pass generated data
- Standardized the team's data engineering practice — from **experience-driven** to **strategy-driven**
- Powered several in-production fine-tuning projects as the default data pipeline
- Badcase-to-training: **days → hours**

---

## Architecture

Three-tier split. UI is the workbench, Node layer owns business logic and file safety, Python layer owns LLM orchestration and the two-stage generation paradigm.

```
┌─────────────────────────────────────────────┐
│  React Frontend + TypeScript                 │  Workbench
│  (Vite + Tailwind)                           │  • Seed import & preview
└──────────────┬──────────────────────────────┘  • Task cards & progress
               │                                  • Real-time export
               │ REST (Express)
               ▼
┌─────────────────────────────────────────────┐
│  Express Backend + TypeScript                │  Business logic & I/O
│  (JWT, CSV safety, progress queue)           │  • Task ownership
└──────────────┬──────────────────────────────┘  • Concurrent-write locks
               │                                  • Format validation
               │ HTTP
               ▼
┌─────────────────────────────────────────────┐
│  FastAPI Python Service                      │  LLM orchestration
│  (Doubao, skeleton extractor, quality gate) │  • Two-stage generation
│  (Prompt-injection & content safety)         │  • Semantic tagging
└─────────────────────────────────────────────┘  • Retry & fallback
```

### Security & robustness

- **JWT authentication** — HMAC-SHA256, 7-day sessions, no plaintext passwords at rest
- **Ownership isolation** — every mutation routed through `assertTaskOwner()` — no cross-user leaks
- **Concurrent-write safety** — Promise-chain mutual exclusion on shared file I/O
- **CSV injection protection** — RFC 4180 + formula-prefix escaping (`=+-@` → `'=+-@`)
- **Dual-pass content safety** — classifier on both input and LLM output
- **Prompt-injection detection** — XML boundary markers + input truncation

### Real-time progress, not fire-and-forget

Every generation returns a `job_id`. Poll it:

```
GET /api/algorithm/progress/:jobId
→ { generated: 42, total: 100, eta_seconds: 18, status: "running" }
```

---

## Quick start

```bash
git clone https://github.com/your-org/corpusflow.git
cd corpusflow
bash setup.sh         # checks Node 20+ / Python 3.11+ / uv; prompts for API key
npm run dev:all       # boots frontend + backend + Python service

# open http://localhost:3000
```

Docker (optional):

```bash
docker compose up --build
```

---

## Environment

Copy `.env.example` → `.env.local`, then edit:

```bash
PORT=3000
ALGORITHM_BASE_URL=http://127.0.0.1:8001

# Doubao (ByteDance) — https://console.volcengine.com/iam/keymanage
ARK_API_KEY=your_key_here
ARK_MODEL=doubao-seed-1-6-250615
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_TIMEOUT_SECONDS=120

VITE_API_BASE_URL=
```

---

## Output formats

| Type | Fields | Fine-tuner style |
|---|---|---|
| **QA** | `q`, `a` | Basic question–answer |
| **Instruct** | `instruction`, `input`, `output` | Alpaca |
| **Multi-turn** | `conversations: [{from, value}]` | ShareGPT |
| **Code** | `instruction`, `code` | Code-model SFT |

All types export to **JSON / CSV / JSONL** with metadata stripping and injection protection.

---

## Roadmap

- [x] Skeleton-first two-stage generation (4 formats)
- [x] Task-card abstraction for three production workflows
- [x] Upstream dialog-platform integration (badcase loop)
- [x] Multi-dimensional quality gate (entity consistency, semantic similarity)
- [x] JWT auth · content safety · prompt-injection detection · CSV injection protection
- [ ] Semantic deduplication
- [ ] Dataset diff & comparison
- [ ] Hugging Face Datasets Hub export
- [ ] Skeleton library — cross-task reusable templates

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).

Copyright 2026 Harland.

## Author

**Harland** — AI systems, language models, and the data that powers them.

- Email: haolang95@gmail.com
- GitHub: [@Longfellow1](https://github.com/Longfellow1)

---

> *The real leverage in LLM iteration isn't the model — it's the data engineering that feeds it.*
