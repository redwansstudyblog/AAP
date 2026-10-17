/**
 * AAP routes (Next.js App Router) — admin key management + redemption
 * -----------------------------------------------------------------
 * Three groups of routes:
 *
 *   (A) ADMIN routes — behind your site's normal login. The owner uses
 *       these to generate/list/revoke single-use keys.
 *   (B) REDEEM route — PUBLIC (no normal login), but only works with a
 *       valid, unused, unrevoked raw key. This is where an AI exchanges
 *       its one-time key for a short-lived session token.
 *   (C) TASK endpoints — the actual data (list_classes, etc.), protected
 *       by the SESSION TOKEN from (B), not by the raw key.
 *
 * ============================================================
 * (A) FILE: app/api/ai-access/keys/route.js
 * ============================================================
 *   import { inMemoryDb, createKey, listKeys } from '@/middleware/keyStore';
 *   import { requireUserSession } from '@/your-existing-auth'; // your own site login check
 *
 *   const db = inMemoryDb; // swap for your real database adapter
 *
 *   export async function GET(request) {
 *     const user = await requireUserSession(request);
 *     if (!user) return Response.json({ ok: false, error: 'Not logged in' }, { status: 401 });
 *     const keys = await listKeys({ accountId: user.accountId, db });
 *     return Response.json({ ok: true, keys });
 *   }
 *
 *   export async function POST(request) {
 *     const user = await requireUserSession(request);
 *     if (!user) return Response.json({ ok: false, error: 'Not logged in' }, { status: 401 });
 *     const { label, scope } = await request.json();
 *     const { rawKey, record } = await createKey({ accountId: user.accountId, label, scope, db });
 *     // rawKey shown ONCE — the frontend must display it now, it can't be fetched again.
 *     return Response.json({ ok: true, rawKey, key: record });
 *   }
 *
 * FILE: app/api/ai-access/keys/[id]/route.js
 *   import { inMemoryDb, revokeKey } from '@/middleware/keyStore';
 *   import { requireUserSession } from '@/your-existing-auth';
 *   const db = inMemoryDb;
 *
 *   export async function DELETE(request, { params }) {
 *     const user = await requireUserSession(request);
 *     if (!user) return Response.json({ ok: false, error: 'Not logged in' }, { status: 401 });
 *     const revoked = await revokeKey({ keyId: params.id, accountId: user.accountId, db });
 *     if (!revoked) return Response.json({ ok: false, error: 'Key not found' }, { status: 404 });
 *     return Response.json({ ok: true });
 *   }
 *
 * ============================================================
 * (B) FILE: app/api/ai-access/session/route.js   — PUBLIC, no normal login
 * ============================================================
 *   import { inMemoryDb, inMemorySessionDb, redeemKey } from '@/middleware/keyStore';
 *   import { reportAccess, checkControlStatus } from '@/middleware/telemetry';
 *   const db = inMemoryDb, sessionDb = inMemorySessionDb; // swap for real DBs
 *
 *   export async function POST(request) {
 *     // Ask your team's control panel: is this site blocked, or below
 *     // the minimum enforced version? Fails open automatically if the
 *     // control server is unreachable (see telemetry.js).
 *     const status = await checkControlStatus();
 *     if (status.blocked) {
 *       return Response.json({ ok: false, error: 'This site's AI access is currently disabled.' }, { status: 403 });
 *     }
 *     if (status.forceUpdateRequired) {
 *       return Response.json(
 *         { ok: false, error: `This site must update to v${status.latestVersion} before AI access can continue.` },
 *         { status: 426 } // 426 Upgrade Required
 *       );
 *     }
 *
 *     const rawKey = request.headers.get('x-aap-key');
 *     if (!rawKey) {
 *       return Response.json({ ok: false, error: 'Missing X-AAP-Key header.' }, { status: 401 });
 *     }
 *     const result = await redeemKey(rawKey, { db, sessionDb, sessionTtlMinutes: 30 });
 *     if (!result) {
 *       return Response.json(
 *         { ok: false, error: 'Key is invalid, already used, or revoked.' },
 *         { status: 401 }
 *       );
 *     }
 *
 *     // Fire-and-forget usage log for your dashboard — never awaited
 *     // in a way that could slow down or fail the real response.
 *     reportAccess({ event: 'key_redeemed', meta: { scope: result.scope } });
 *
 *     // This is the ONLY time the session token is ever shown.
 *     return Response.json({
 *       ok: true,
 *       sessionToken: result.sessionToken,
 *       expiresAt: result.expiresAt,
 *     });
 *   }
 *
 * ============================================================
 * (C) FILE: app/api/ai-access/classes/route.js   — example task endpoint
 * ============================================================
 *   import { inMemorySessionDb, validateSession } from '@/middleware/keyStore';
 *   const sessionDb = inMemorySessionDb;
 *
 *   export async function GET(request) {
 *     const sessionToken = request.headers.get('x-aap-session');
 *     const session = await validateSession(sessionToken, sessionDb);
 *     if (!session) {
 *       return Response.json(
 *         { ok: false, error: 'Missing or expired session. Redeem a key at /api/ai-access/session first.' },
 *         { status: 401 }
 *       );
 *     }
 *     const data = await getClassesFor(session.accountId); // your own data fetch
 *     return Response.json({ ok: true, data });
 *   }
 *
 * Repeat the pattern in (C) for every endpoint you listed in your
 * discovery file (SPEC.md / ai-access.json) — every one of them checks
 * X-AAP-Session, never X-AAP-Key directly.
 *
 * ============================================================
 * (D) FILE: app/api/ai-access/update-status/route.js  — behind your normal login
 * ============================================================
 * The admin dashboard (AdminKeyPanel.jsx) can't read server env vars or
 * call the control server directly from the browser — it needs a route
 * to ask your OWN server, which already has CONTROL_SERVER_URL/KEY.
 *
 *   import { checkControlStatus } from '@/middleware/telemetry';
 *   import { requireUserSession } from '@/your-existing-auth';
 *
 *   export async function GET(request) {
 *     const user = await requireUserSession(request);
 *     if (!user) return Response.json({ ok: false, error: 'Not logged in' }, { status: 401 });
 *     const status = await checkControlStatus();
 *     return Response.json({ ok: true, ...status });
 *   }
 *
 * `requireUserSession` in group (A) is a placeholder for however your
 * site already checks who's logged in (NextAuth, a cookie session,
 * Supabase auth, etc.). Group (B) and (C) must NOT sit behind that
 * check — they're what the external AI calls, and it never logs into
 * your site the normal way.
 */
module.exports = {};
