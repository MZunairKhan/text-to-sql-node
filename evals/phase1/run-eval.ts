/**
 * Phase 1 retrieval-quality eval — a manual-verification AID, not a strict
 * gate. The execution plan's Phase 1 definition of done is "manually
 * verify all 10 sample queries retrieve the tables a human would pick";
 * this script just puts expected-vs-actual side by side so that review is
 * fast, since some near-misses (e.g. an extra plausible table at topK) are
 * fine and don't mean the retriever is broken.
 *
 * Requires:
 *   - Stack running (docker compose up), API reachable on localhost:3000
 *   - Embeddings populated (docker compose exec api npm run embed:schema)
 *
 * Runs on the HOST, not inside the api container: evals/ lives at the repo
 * root, outside the api/ Docker build context, so it isn't in the image.
 * No dotenv import on purpose: from evals/ it can't resolve
 * api/node_modules, and API_URL has a default anyway.
 *
 * From the repo root (PowerShell):
 *   cd api
 *   npx ts-node --transpile-only ../evals/phase1/run-eval.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface EvalCase {
  query: string;
  expectedTables: string[];
}

async function main() {
  const cases: EvalCase[] = JSON.parse(readFileSync(join(__dirname, 'queries.json'), 'utf-8'));

  let passed = 0;
  for (const [i, c] of cases.entries()) {
    const res = await fetch(`${API_URL}/schema-retrieval/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: c.query, topK: Math.max(3, c.expectedTables.length) }),
    });

    if (!res.ok) {
      console.log(`\u2717 [${i + 1}] "${c.query}" \u2014 request failed (${res.status})`);
      continue;
    }

    const body = (await res.json()) as { tables: { tableName: string; source?: string }[] };
    const retrieved = body.tables.map((t) => t.tableName);
    // * marks tables added by foreign-key expansion rather than similarity.
    const shown = body.tables.map((t) =>
      t.source && t.source !== 'similarity' ? `${t.tableName}*` : t.tableName,
    );
    const missing = c.expectedTables.filter((t) => !retrieved.includes(t));
    const ok = missing.length === 0;
    if (ok) passed++;

    console.log(
      `${ok ? '\u2713' : '\u2717'} [${i + 1}] "${c.query}"\n` +
        `    expected: ${c.expectedTables.join(', ')}\n` +
        `    got:      ${shown.join(', ')}` +
        (ok ? '' : `\n    missing:  ${missing.join(', ')}`),
    );
  }

  console.log(`\n${passed}/${cases.length} passed (* = added by FK expansion, not similarity)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
