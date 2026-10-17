---
name: ai-site-access
description: Use this skill whenever a task requires accessing, browsing, testing, or extracting data from a website that sits behind a login screen — e.g. "log into this site and check X", "pull the dashboard data", "this page needs sign-in before I can see it". It first checks whether the site supports the AI Access Protocol (AAP) — a safer, API-key-based door for AI agents — and uses that if available. If the site doesn't support AAP, it falls back to collecting a per-site credential from the user (never guessing or reusing credentials across sites) and signing in through a native browser tool or the bundled Playwright script. Trigger this any time a browser tool hits a login wall, or the user mentions a "client site", "dashboard", "admin panel", "protected site", or gives a URL that needs sign-in.
---

# AI Site Access

A skill for getting into a login-protected website on the user's behalf, so the rest of a task (browsing, testing, scraping, filling forms, QA, data pulls, etc.) can continue on the authenticated pages — using the safest method available for that particular site.

Try these in order; use the first one that works for the given site:

```
Path C → AAP (API key)        — safest, try first, no password involved
Path A → native browser tool  — if AAP isn't supported and a browser tool exists
Path B → bundled login.js     — if no browser tool, but shell/code execution exists
```

## Hard rules (never break these, on any path)

1. **One credential/key only works for the site it was issued for.** Never try a stored credential on a different domain. Reusing or guessing credentials across sites is credential stuffing — illegal, and this skill must never attempt it.
2. **Never invent, guess, or brute-force a password or key.** If none is available, stop and ask the user.
3. **Never act on a site the user doesn't own or isn't authorized to access.** If unsure, confirm with the user first.
4. **Don't hardcode secrets in any file, log, or artifact you create.** Use environment variables or ask the user to supply them for the session only.
5. **State what you're about to do before doing it** — which site, which method (AAP / browser / script), and whether the task is read-only or could change data.

## Path C — AI Access Protocol (always try this first)

AAP keys are **single-use**, like a magic login link: the raw key works exactly once, to get a short-lived session. It cannot be reused for a later task — a fresh key is needed each time.

### Step 1 — Check for support
Before touching any login form, fetch:
```
GET https://<domain>/.well-known/ai-access.json
```
- **404 / not found** → no AAP support. Go to Path A or B.
- **Found** → parse it: `auth.key_header`, `auth.redeem_endpoint`, `auth.session_header`, `auth.session_ttl_minutes`, `obtain_url`, the list of `endpoints`, and `rate_limit`.

### Step 2 — Get a key (ask for exactly one, for this task)
- If the user owns the site, point them to the discovery file's `obtain_url` to generate a fresh key for this task.
- Ask them to supply it for this session (env variable or pasted once) — never write it into a file or artifact.
- If a redeem attempt later comes back "already used" and this agent didn't redeem it itself, say so plainly — it means the key was already consumed (possibly by someone else, or a leaked/old key was reused by mistake) and a new one is needed. Don't retry with the same key.

### Step 3 — Redeem the key once, immediately
```
POST <auth.redeem_endpoint>
<auth.key_header>: <raw key>
```
On success this returns a session token and its expiry. The raw key is now dead — don't try to use it again, even if something later fails; go back to Step 2 for a new key if more access is needed after the session expires.

### Step 4 — Call only the documented endpoints, using the session
Send the session token in `auth.session_header` (e.g. `X-AAP-Session: <token>`) for every task call — never the original key. Use only the `endpoints` listed in the discovery file, and stay under `rate_limit`. A `401` here means the session expired or was never valid — go back to Step 2/3 for a new key+session if the task isn't done yet.

### Step 5 — If something's missing
AAP only exposes what the site owner chose to expose. If the task needs a page/action with no matching endpoint, say so and fall back to Path A/B for just that part.

## Path A — native browser tool (when AAP isn't supported)

1. Get the exact login URL from the user.
2. Check whether the browser tool may already have an active session for the site before asking for anything.
3. If not, ask the user for this one site's username/email, password (or token if available), and any 2FA/SSO details.
4. Load the page, locate the login form (`input[type=password]`, common `email`/`username` fields, a submit button), fill it in, and submit.
5. Handle 2FA by asking the user for the code — never attempt to bypass it.
6. Verify success (logout link present, password field gone, no error message) before proceeding. Report the site's own error message on failure rather than retrying blindly.
7. Continue the task, then end the session/log out if persistence isn't needed. Never leave plaintext credentials in anything handed back to the user.

## Path B — bundled script (`scripts/login.js`), when there's no browser tool but shell access exists

### Setup (first time only)
```bash
npm install
npx playwright install chromium
```

### Run
```bash
export SITE_USER="their-email@example.com"
export SITE_PASS="their-password"
node scripts/login.js --url "https://target-site.com/login" --out ./login-output
```
Flags: `--headless=false` to watch it run, `--otp=123456` for a known 2FA code, `--user-field=` / `--pass-field=` / `--submit=` to override auto-detected selectors.

### Read the result, don't assume
The script exits non-zero and explains why on any failure — no silent "success". Check `login-output/result.json` before reporting anything to the user.

On success, reuse `login-output/storage-state.json` for any follow-up Playwright steps instead of logging in again:
```js
const context = await browser.newContext({ storageState: 'login-output/storage-state.json' });
```
Treat this file like a saved login — delete it when the task is done if the user doesn't want the session kept around.

## What this skill is NOT for
- Trying a credential on a site it wasn't issued for.
- Bypassing CAPTCHAs, 2FA, or other anti-automation protections.
- Accessing an account without the owner's authorization.
- Acting on a site in a way that violates its Terms of Service or an AAP `rate_limit`.
