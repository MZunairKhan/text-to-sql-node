# Deterministic Text-to-SQL Engine

> Status: Phase 0 — repo scaffolding & environment. Architecture, guardrails, and
> demo details will be filled in as later phases land (see Phase 7).

A secure backend API that turns natural language questions into validated,
read-only SQL — with AST-based guardrails, least-privilege execution, and a
self-healing retry loop, so the LLM is treated as an untrusted SQL author
rather than a trusted one.

## Quickstart

```bash
cp .env.example .env   # then fill in real passwords + ANTHROPIC_API_KEY
docker compose up
curl localhost:3000/health
```

Expected: `{"status":"ok","timestamp":"..."}`

## Status

- [x] Repo scaffolding & Docker environment (Phase 0)
- [ ] Schema retrieval (Phase 1)
- [ ] SQL generation (Phase 2)
- [ ] Guardrails — AST validation + safe execution (Phase 3)
- [ ] Retry loop & streaming (Phase 4)
- [ ] Observability & cost accounting (Phase 5)
- [ ] Frontend (Phase 6)
