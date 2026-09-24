# Whisper 360 — UI Test Suite

Playwright regression suite for the Whisper 360 web app, covering login/auth, the
Team Inbox, Email, dashboards, and AI Studio agent creation.

## Setup

```bash
npm install
npx playwright install chromium
```

Credentials live in `.env` (git-ignored):

```
TEST_URL=https://whisper360.io/v2?suite=messenger&page=inbox&auth=login
TEST_EMAIL=...
TEST_PASSWORD=...
```

## Running

```bash
npm test              # full suite, headless
npm run test:ui       # interactive UI mode
npm run test:auth     # just the login/logout/invalid-credential flows
npm run report        # open the last HTML report
```

Run on whichever days you choose — there's no fixed schedule wired up locally.
See "Scheduling & CI" below for wiring up automatic runs with results delivered
to you.

## Structure

```
tests/
  pages/               — Page Object Model: one class per module/screen
    BasePage.ts        — shared overlay-dismissal & popover-close helpers
    LoginPage.ts        — pre-auth login screen
    InboxPage.ts        — Team Inbox: conversations, tags, assignment, follow-ups
    EmailPage.ts        — Email ticket list + ticket detail
    DashboardPage.ts    — dashboard tabs & reporting period
    StudioPage.ts       — AI Studio agent creation & cleanup
  auth.setup.ts         — signs in once, saves playwright/.auth/user.json
  auth.spec.ts          — login, logout, invalid credentials, session persistence
  inbox.spec.ts         — Team Inbox layout, filters, replies, tags, assignment,
                          saved replies, customer details, follow-ups, search,
                          ownership tabs, channel filter, resolve, snooze,
                          take-ownership/release
  email.spec.ts         — Email ticket list, filters, search, replying
  dashboard.spec.ts     — dashboard widgets and tab/period switching
  agent-creation.spec.ts — AI Studio's 4 agent-creation entry points
```

Every spec talks to the app only through its page object — a spec never holds
a raw `page.locator(...)` for a selector that another spec also needs. When the
app's markup changes, there is exactly one place to fix it.

On failure, Playwright captures a screenshot, video, and trace automatically
(see `playwright-report/` and `test-results/` after a run).

## Adding a new module (e.g. RevOps, Customer 360)

1. Add a `tests/pages/<Module>Page.ts` extending `BasePage`. Put every selector
   for that module there — a `goto()`, and one method per user action (open X,
   click Y, assert Z is a *page object* method, not spec code).
2. Add `tests/<module>.spec.ts` that imports the page object and only calls its
   methods plus `expect()` on locators it exposes.
3. Add the new spec file to the `authenticated` project's `testMatch` regex in
   `playwright.config.ts`.
4. If the module has its own designated "safe to interact with" test record
   (like Team Inbox's "Lolo" or Email's "test email 2"), name it clearly (a
   `TEST_*` constant at the top of the spec) and note it in "Test data notes"
   below so the next person doesn't wonder why that one conversation/ticket/
   record gets touched by automation.

This is what keeps the suite scalable: page objects absorb app quirks (popups,
stale dropdowns, unreliable deep links) once, so a new spec is typically 20-40
lines of readable, quirk-free assertions.

## Test data notes

- This workspace ("Liberty Assured") is a designated test account, so specs
  interact with real conversations/tickets/tags/agents in it directly
  (confirmed with the workspace owner — see brief).
- `inbox.spec.ts` targets the "Lolo" conversation specifically. If that
  conversation is ever deleted/renamed, update `TEST_CONVERSATION` in that file.
- The resolve/snooze/take-ownership/assign-teammate tests mutate Lolo's real
  status and assignment, then revert it in a `finally` block via
  `InboxPage.findAndOpen()` — a status/ownership change can knock the
  conversation out of whatever view was active (the app auto-selects a
  different one), so cleanup re-locates it by name rather than assuming the
  panel still shows it. There is no single "all states" filter pill — only
  Active work / Open now / Waiting / Resolved, each mutually exclusive — so
  `findAndOpen()` tries the default view first and falls back to the Resolved
  filter. The "Conversation status" control is a real native `<select>` — read
  its value with `.inputValue()`, never `.innerText()` (which lists every
  option, not the selected one). "Resolve" is a **toggle**: clicking it again
  un-resolves — that's the reliable way back to Open from Resolved (the status
  `<select>` doesn't offer a working reverse transition the way it does from
  Snoozed). The reply box (and saved-reply insertion) is a real `<textarea>` —
  same `.inputValue()` rule applies, not `.innerText()`.
- A "Receive calls when Whisper360 is closed" notification banner can mount on
  any screen and cover conversation controls; `BasePage.dismissCopilot()`
  dismisses it via its "Not now" button (its only accessible label — the
  banner itself has no visible text naming that button).
- **Known issue, as of 2026-09-24:** the live app appears to be mid-rollout of
  UI changes across at least two modules — AI Studio's "Create an agent"
  screen was completely replaced (the old Standard Agent Builder / Build by AI
  / Quick Start / Starter Template four-card screen is gone, replaced by a
  "Bot Studio" vs. "Agent Studio" two-path screen), which breaks
  `agent-creation.spec.ts` outright. Team Inbox's filter-panel labels also
  intermittently failed an assertion (`getByText('Active work', {exact:true})`)
  that had been stable for weeks, on a pill that was visibly on-screen and
  unchanged in a screenshot — consistent with a partial/staged rollout rather
  than a one-off flake. Don't invest more fixing effort into either until it's
  confirmed which UI is the new stable one; a full selector-audit pass across
  every spec is the right next step once that's settled, not spec-by-spec
  patching against a moving target.
- `email.spec.ts` targets the "test email 2" ticket specifically (its subject
  line is itself a test artifact). If it's ever deleted/renamed, update
  `TEST_TICKET` in that file.
- `agent-creation.spec.ts` deletes any agent literally named "New agent" after
  its Standard Agent Builder test, since entering that builder immediately
  creates a persisted draft under that name. Don't rely on "New agent" as a
  real agent name in this workspace.
- Neither `suite=ai&page=agents` nor `suite=messenger&page=email` are reliable
  deep links — both can silently land on a different screen (Overview /
  Dashboard) instead of the one you asked for. `StudioPage` and `EmailPage`
  both navigate via the sidebar nav link instead of trusting the URL, and any
  new page object hitting this should do the same — check by navigating in a
  real browser before trusting a `page=` query param.

## Scripted vs. AI-agent fallback

Per the project brief, flows that are deterministic and stable are scripted
directly (login, inbox, email, dashboards, the Standard Agent Builder). AI
Studio's "Build by AI" and "Quick Start" agent-creation paths drive an
open-ended, business-specific conversation rather than a fixed set of fields —
those are only smoke-tested here (confirming the flow opens); a
natural-language AI browser agent is the better tool for judging their full
completion, per the brief's hybrid strategy.

## A note on flakiness under heavy testing volume

Two things were observed for real while building and validating this suite,
both from running it many times back-to-back in a short window (not from
normal, occasional use):

1. **Login rate-limiting** — the app returns "Too many attempts. Try again
   shortly." after several fast sign-ins. `auth.spec.ts` performs ~6 logins per
   run; `loginRejectionMessage` in that file already treats the rate-limit
   message as a valid rejection for the *invalid*-credential tests, but the
   *valid*-login tests will still fail if the account itself gets throttled.
2. **General backend slowness** — plain page loads and clicks occasionally
   exceed their timeout under heavy concurrent testing (not a code bug; the
   same action reliably works standalone). If you see an isolated, hard-to-
   reproduce timeout failure with no corresponding logic change, re-run before
   assuming something broke.

If either happens, wait a minute or two between runs.

## Scheduling & CI

To run this suite automatically (on a schedule and/or on demand) and get the
results delivered to you without babysitting a terminal, wire it into GitHub
Actions — see the project's CI setup guidance for the workflow file and how to
trigger it manually or on chosen days.

## Open items (carried over from the brief)

1. Confirm whether the "no destructive actions" caveat should still apply to
   any *other* workspace this suite might later run against (it does not
   apply to Liberty Assured — confirmed test account).
2. Decide where credentials should live once this moves into CI (GitHub
   Actions secrets rather than a local `.env`).
3. Decide which days to schedule automatic runs on, once CI is wired up.
4. Extend coverage to RevOps and Customer 360 (planned next, following the
   same Page Object Model pattern documented above).
