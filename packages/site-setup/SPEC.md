# AI Access Protocol (AAP) — v0.1 draft

A tiny, open convention that lets any website declare: "AI agents can access
(parts of) this site through a documented API, authenticated with a key —
not by guessing passwords or driving a browser through the login form."

It's modeled on things that already work well as conventions: `robots.txt`,
`.well-known/security.txt`, OpenAPI. No central authority, no registration —
a site just publishes a file at a fixed path and any agent can discover it.

## 1. Discovery file

Every participating site publishes:

```
https://<site>/.well-known/ai-access.json
```

Minimal example:

```json
{
  "aap_version": "0.1",
  "site": "ClassNests",
  "description": "Class scheduling and student management tool.",
  "auth": {
    "type": "single_use_key",
    "key_header": "X-AAP-Key",
    "redeem_endpoint": "/api/ai-access/session",
    "session_header": "X-AAP-Session",
    "session_ttl_minutes": 30,
    "obtain_url": "https://classnests.vercel.app/settings/ai-access"
  },
  "endpoints": [
    {
      "name": "dashboard_summary",
      "method": "GET",
      "path": "/api/ai-access/dashboard",
      "description": "Returns the logged-in-equivalent dashboard data as JSON."
    },
    {
      "name": "list_classes",
      "method": "GET",
      "path": "/api/ai-access/classes",
      "description": "Returns the list of classes for the authenticated account."
    }
  ],
  "rate_limit": "60 requests / minute",
  "contact": "support@classnests.example"
}
```

### Required fields
- `aap_version` — spec version this file follows.
- `auth.type` — for v0.1, only `"single_use_key"` is defined.
- `auth.key_header` — header the raw, single-use key goes in when calling `redeem_endpoint`.
- `auth.redeem_endpoint` — the one-time exchange endpoint (see §2).
- `auth.session_header` — header the resulting session token goes in for every task endpoint call.
- `auth.session_ttl_minutes` — how long the session is valid for after redemption.
- `endpoints` — the list of AI-accessible operations, each with a stable `name`, HTTP `method`, `path`, and a one-line `description` an AI can use to decide which endpoint fits a request. All of these expect `session_header`, not `key_header`.

### Why a discovery file instead of just "the API docs"
An AI agent can check for this one fixed path on *any* domain and immediately know: does this site support AAP, how do I authenticate, what can I ask for — without a human pasting docs into the chat first.

## 2. Authentication — single-use key → short-lived session

A raw AAP key is **single-use**, like a magic login link. It is never sent to the task endpoints directly. Instead:

1. The site owner generates a raw key from their own dashboard (never reuses a user's login password for this) and hands it to the AI/agent that needs access.
2. The agent calls the **redeem endpoint** once, with the raw key in the auth header:
   ```
   POST /api/ai-access/session
   X-AAP-Key: aap_live_8f3e...
   ```
   This immediately burns the key — it can never be redeemed again, by anyone, even if it leaks afterward.
3. The site responds with a **short-lived session token** (default 30 minutes):
   ```json
   { "ok": true, "sessionToken": "aap_sess_...", "expiresAt": "2026-10-16T11:10:00Z" }
   ```
4. The agent uses this session token — not the original key — for every actual task call, in the header named in the discovery file's `session.header` (see below):
   ```
   GET /api/ai-access/classes
   X-AAP-Session: aap_sess_...
   ```
5. When the session expires, access ends. To work with the site again, the owner must generate a brand-new key — there is no way to refresh or extend a session with the same key.

**Why this is safer than a long-lived key:** a leaked raw key is useless once redeemed (by the legitimate agent or anyone else) — whoever redeems it first wins and everyone else is locked out, which also means the owner finds out immediately if a key leaked (the agent will report "already used" when it wasn't the one to redeem it). A leaked session token is still time-boxed to a short window.

- Keys and sessions must be revocable/rotatable at any time from the site's own settings.
- Both are sent only as request headers, never embedded in a URL or query string.

## 3. What this is NOT

- **Not** a way to access a site that hasn't opted in. If `.well-known/ai-access.json` doesn't exist (404), AAP stops there — no fallback to guessing credentials or scraping around it.
- **Not** a replacement for normal user authentication — it's a parallel, narrower door specifically for automated/agent access, with its own key and its own scope.
- **Not** a way to bypass a site's rate limits or terms of service — the `rate_limit` field is a hard ceiling an agent must respect.

## 4. Minimal request/response example

**Step 1 — redeem the key (once):**
```
POST /api/ai-access/session HTTP/1.1
Host: classnests.vercel.app
X-AAP-Key: aap_live_8f3e...
```
```json
{ "ok": true, "sessionToken": "aap_sess_7cd1...", "expiresAt": "2026-10-16T11:10:00Z" }
```

**Step 2 — use the session for task endpoints:**
```
GET /api/ai-access/classes HTTP/1.1
Host: classnests.vercel.app
X-AAP-Session: aap_sess_7cd1...
Accept: application/json
```
```json
{
  "ok": true,
  "data": [
    { "id": "c_101", "name": "Grade 6 - Math", "students": 28 },
    { "id": "c_102", "name": "Grade 6 - Science", "students": 25 }
  ]
}
```

On a bad/missing/already-used key, or a missing/expired session, the endpoint must return `401` with a JSON body, never a silent redirect to an HTML login page (which is what makes AAP reliably machine-readable, unlike normal web login flows).
