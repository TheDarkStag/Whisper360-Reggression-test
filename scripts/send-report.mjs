// Emails the run's results by POSTing them to the Activepieces webhook, whose flow sends the
// Gmail message (subject/recipient are set in that flow). The webhook URL is a secret:
//   REPORT_WEBHOOK_URL=... node scripts/send-report.mjs [results.json]
//   node scripts/send-report.mjs --dry-run   # writes test-results/email-preview.html, sends nothing
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadRows } from './lib-results.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--')) ?? 'playwright-report-json/results.json';
const rows = loadRows(file);
if (!rows) {
  console.error(`[report] ${file} not found — nothing to send.`);
  process.exit(dryRun ? 1 : 0);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (st) => rows.filter((r) => r.status === st).length;
const passed = n('expected'), failed = n('unexpected'), flaky = n('flaky'), skipped = n('skipped');
const total = rows.length;
const executed = passed + failed + flaky;
const passRate = executed ? (((passed + flaky) / executed) * 100).toFixed(1) : '0.0';
const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';
const statusText = failed ? 'Issues Found' : 'All Tests Passed';
const statusColor = failed ? '#f87171' : '#4ade80';

const tile = (value, label, color, bg, border) =>
  `<td width="23%" style="text-align:center;background:${bg};border:1px solid ${border};border-radius:10px;padding:18px 8px;">` +
  `<div style="font-size:32px;font-weight:800;color:${color};line-height:1;">${value}</div>` +
  `<div style="font-size:10px;color:#9a9ab0;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">${label}</div></td>`;

const card = (r) => {
  const isFail = r.status === 'unexpected';
  const color = isFail ? '#dc2626' : '#d97706';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;border:1px solid ${isFail ? '#fee2e2' : '#fef3c7'};border-radius:10px;overflow:hidden;">
<tr><td width="4" style="background:${color};"></td><td style="padding:14px 16px;background:${isFail ? '#fff8f8' : '#fffdf5'};">
<span style="display:inline-block;background:${isFail ? '#fee2e2' : '#fef3c7'};color:${color};font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;letter-spacing:0.5px;">${isFail ? 'FAILED' : 'FLAKY — PASSED ON RETRY'}</span>
<div style="font-size:13px;font-weight:700;color:#1a1a3e;line-height:1.6;margin-top:8px;">${esc(r.name)}</div>
<div style="font-size:12px;color:#6a6a8a;line-height:1.7;"><strong>File:</strong> ${esc(r.file)} · <strong>Retries:</strong> ${r.retries}</div>
${r.err ? `<div style="font-size:11px;color:#6a6a8a;background:#f8f8fc;border-radius:6px;padding:8px 10px;margin-top:8px;font-family:monospace;word-break:break-word;">${esc(r.err)}</div>` : ''}
</td></tr></table>`;
};

const attention = rows.filter((r) => r.status === 'unexpected' || r.status === 'flaky');
const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;"><tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">
<tr><td style="background:#2d1060;border-radius:12px 12px 0 0;padding:32px 36px;text-align:center;">
<div style="font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;">Automated QA Report</div>
<div style="font-size:26px;font-weight:800;color:#ffffff;margin-bottom:6px;">Whisper360 UI Tests</div>
<div style="font-size:13px;color:rgba(255,255,255,0.7);">${date} · <span style="color:${statusColor};font-weight:700;">${statusText}</span></div>
</td></tr>
<tr><td style="background:#6B2FBF;height:4px;"></td></tr>
<tr><td style="background:#ffffff;padding:30px 36px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
${tile(total, 'Total', '#1a1a3e', '#f8f7ff', '#ede8ff')}<td width="3%"></td>
${tile(passed + flaky, 'Passed', '#16a34a', '#f0fdf4', '#bbf7d0')}<td width="3%"></td>
${tile(failed, 'Failed', '#dc2626', '#fff5f5', '#fecaca')}<td width="3%"></td>
${tile(skipped, 'Skipped', '#7c3aed', '#faf5ff', '#e9d5ff')}
</tr></table>
<p style="font-size:13px;color:#4a4a6a;line-height:1.7;">Pass rate (executed tests): <strong style="color:#16a34a;">${passRate}%</strong>${flaky ? ` · ${flaky} test(s) only passed on retry` : ''}.</p>
${attention.length ? `<div style="font-size:10px;font-weight:700;color:#6B2FBF;letter-spacing:3px;text-transform:uppercase;margin:24px 0 12px;">Needs attention</div>${attention.map(card).join('')}` : '<p style="font-size:14px;color:#16a34a;font-weight:600;">Every test passed.</p>'}
${runUrl ? `<p style="font-size:12px;color:#6a6a8a;margin-top:24px;">Full per-test table and screenshots/videos: <a href="${runUrl}">${runUrl}</a></p>` : ''}
</td></tr>
<tr><td style="background:#1a0533;border-radius:0 0 12px 12px;padding:16px;text-align:center;font-size:11px;color:rgba(255,255,255,0.4);">Whisper360 UI Tests · Liberty Assured · Do not reply to this email</td></tr>
</table></td></tr></table></body></html>`;

const payload = {
  totalTests: total, passed: passed + flaky, failed, skipped, flaky, date, passRate, status: statusText, runUrl,
  report: html,
  issues: attention.map((r) => ({ test: r.name, file: r.file, status: r.status, retries: r.retries, error: r.err })),
};

if (dryRun) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/email-preview.html', html);
  console.log(`[report] dry run: ${total} tests, ${failed} failed. Preview → test-results/email-preview.html (nothing sent)`);
  process.exit(0);
}

const url = process.env.REPORT_WEBHOOK_URL;
if (!url) {
  console.log('[report] REPORT_WEBHOOK_URL is not set — skipping the email.');
  process.exit(0);
}
try {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  console.log(`[report] sent — ${passed + flaky} passed, ${failed} failed. Webhook status ${res.status}`);
  if (!res.ok) process.exit(1);
} catch (e) {
  console.error('[report] could not reach the webhook:', e.message);
  process.exit(1);
}
