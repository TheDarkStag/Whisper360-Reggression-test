// Shared by summarize-results.mjs and send-report.mjs: flattens Playwright's JSON report.
import { readFileSync, existsSync } from 'node:fs';

export function loadRows(file) {
  if (!existsSync(file)) return null;
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const rows = [];


  function walk(suite, titles = []) {
    const path = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1];
        const ms = results.reduce((n, r) => n + (r.duration ?? 0), 0);
        const err = (last?.error?.message ?? '').replace(/\x1b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim()) ?? '';
        rows.push({
          file: spec.file,
          name: [...path, spec.title].join(' › '),
          status: t.status, // expected | unexpected | flaky | skipped
          retries: Math.max(results.length - 1, 0),
          ms,
          err: err.trim().slice(0, 200),
        });
      }
    }
    for (const s of suite.suites ?? []) walk(s, path);
  }
  for (const s of report.suites ?? []) walk(s);
  return rows;


}
