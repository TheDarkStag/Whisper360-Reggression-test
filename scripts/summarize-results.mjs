// Turns Playwright's JSON results into a Markdown summary (shown on the GitHub run page).
// Usage: node scripts/summarize-results.mjs [results.json]  >> "$GITHUB_STEP_SUMMARY"
import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2] ?? 'test-results/results.json';
if (!existsSync(file)) {
  console.log('## Whisper360 UI Tests\n\nNo results file was produced — the run stopped before the tests finished. Check the "Run tests" step log.');
  process.exit(0);
}

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

const count = (st) => rows.filter((r) => r.status === st).length;
const passed = count('expected'), failed = count('unexpected'), flaky = count('flaky'), skipped = count('skipped');
const icon = { expected: '✅', unexpected: '❌', flaky: '⚠️', skipped: '⏭️' };
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const cell = (s) => s.replace(/\|/g, '\\|');

const out = [];
out.push(`## Whisper360 UI Tests — ${failed ? '❌ FAILED' : '✅ PASSED'}`);
out.push('');
out.push(`**${rows.length} tests:** ${passed} passed, ${failed} failed, ${flaky} flaky (passed on retry), ${skipped} skipped`);
out.push('');

const bad = rows.filter((r) => r.status === 'unexpected' || r.status === 'flaky');
if (bad.length) {
  out.push('### Needs attention');
  out.push('');
  out.push('| | Test | Retries | Error |');
  out.push('|---|---|---|---|');
  for (const r of bad) out.push(`| ${icon[r.status]} | ${cell(r.name)} | ${r.retries} | ${cell(r.err)} |`);
  out.push('');
}

out.push('### All tests');
out.push('');
const files = [...new Set(rows.map((r) => r.file))];
for (const f of files) {
  const group = rows.filter((r) => r.file === f);
  out.push(`<details><summary><b>${f}</b> — ${group.filter((r) => r.status === 'expected').length}/${group.length} passed</summary>`);
  out.push('');
  out.push('| | Test | Time |');
  out.push('|---|---|---|');
  for (const r of group) out.push(`| ${icon[r.status] ?? '?'} | ${cell(r.name)} | ${secs(r.ms)} |`);
  out.push('');
  out.push('</details>');
  out.push('');
}
out.push('_Screenshots, videos and traces for failures are in the `playwright-report` artifact below._');
console.log(out.join('\n'));
