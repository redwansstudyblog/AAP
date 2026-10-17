/**
 * AAP key store — single-use keys + short-lived sessions
 * --------------------------------------------------------------
 * SECURITY MODEL (updated):
 *   An API key is now SINGLE-USE, like a magic login link.
 *     1. The site owner generates a raw key (createKey) and hands it
 *        to the AI/agent that needs one-time access.
 *     2. The first time that AI calls the "redeem" endpoint with the
 *        raw key, the key is immediately marked used/dead — it can
 *        never be redeemed again, by anyone, even if intercepted later.
 *     3. In exchange, redemption returns a short-lived SESSION TOKEN
 *        (default: 30 minutes). The AI uses this session token — not
 *        the original key — for the actual endpoint calls that make up
 *        its task (e.g. list_classes, dashboard_summary).
 *     4. Once the session expires, the AI's access ends. To access the
 *        site again, the owner must generate a brand new key.
 *
 *   This mirrors how "sign in with a magic link" works: the link/key
 *   gets you a session, the link itself is burned the instant it's used.
 *
 * This file never stores a raw key or raw session token anywhere — only
 * their SHA-256 hashes, the same way you'd handle a password.
 *
 * WHAT YOU MUST WIRE UP
 *   The functions below call `db.*` and `sessionDb.*` — replace the
 *   `inMemoryDb` / `inMemorySessionDb` objects with real calls to your
 *   own database before deploying. The in-memory versions are for local
 *   testing only — everything is lost on restart.
 */

const crypto = require('crypto');

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateRawKey() {
  // aap_live_<32 hex chars> — prefixed so leaked keys are greppable in logs.
  return 'aap_live_' + crypto.randomBytes(16).toString('hex');
}

function generateSessionToken() {
  return 'aap_sess_' + crypto.randomBytes(24).toString('hex');
}

/**
 * createKey({ accountId, label, scope, db })
 *   Generates a new SINGLE-USE key, stores its hash, and returns the
 *   raw key exactly once. Give this raw key to the AI/agent that will
 *   use it — it only works for one redemption.
 *
 * Stored record shape:
 *   { id, accountId, label, scope: string[], keyHash, createdAt,
 *     usedAt: null, revoked: false }
 */
async function createKey({ accountId, label, scope, db }) {
  const rawKey = generateRawKey();
  const record = {
    id: crypto.randomUUID(),
    accountId,
    label: label || 'Unnamed key',
    scope: scope || [],
    keyHash: hashToken(rawKey),
    createdAt: new Date().toISOString(),
    usedAt: null,
    revoked: false,
  };
  await db.saveKeyRecord(record);
  return { rawKey, record: maskRecord(record) };
}

/**
 * redeemKey(rawKey, { db, sessionDb, sessionTtlMinutes })
 *   Called ONCE by the AI/agent to exchange the raw key for a
 *   short-lived session token. Immediately marks the key dead on
 *   success, whether or not the session later gets used.
 *   Returns { sessionToken, expiresAt, accountId, scope } or null if
 *   the key is invalid, already used, or revoked.
 */
async function redeemKey(rawKey, { db, sessionDb, sessionTtlMinutes = 30 }) {
  if (!rawKey) return null;
  const record = await db.findKeyByHash(hashToken(rawKey));
  if (!record || record.revoked || record.usedAt) return null; // already dead or never existed

  // Burn the key immediately — this is what makes it single-use even
  // under a race condition: mark-used must happen before the session
  // is handed out, and a real DB implementation should do this with
  // an atomic "UPDATE ... WHERE usedAt IS NULL" so two simultaneous
  // redemption attempts can't both succeed.
  const usedAt = new Date().toISOString();
  const marked = await db.markKeyUsed(record.id, usedAt);
  if (!marked) return null; // lost the race to another redemption attempt

  const expiresAt = new Date(Date.now() + sessionTtlMinutes * 60 * 1000).toISOString();
  const sessionToken = generateSessionToken();
  await sessionDb.saveSession({
    tokenHash: hashToken(sessionToken),
    accountId: record.accountId,
    scope: record.scope,
    keyId: record.id,
    expiresAt,
  });

  return { sessionToken, expiresAt, accountId: record.accountId, scope: record.scope };
}

/**
 * validateSession(sessionToken, sessionDb) -> { accountId, scope } | null
 *   Use this to protect the actual task endpoints (list_classes, etc.)
 *   — NOT the raw AAP key. The raw key is only ever used once, against
 *   the redeem endpoint.
 */
async function validateSession(sessionToken, sessionDb) {
  if (!sessionToken) return null;
  const session = await sessionDb.findSessionByHash(hashToken(sessionToken));
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return { accountId: session.accountId, scope: session.scope };
}

async function listKeys({ accountId, db }) {
  const records = await db.listKeysForAccount(accountId);
  return records.map(maskRecord);
}

async function revokeKey({ keyId, accountId, db }) {
  return db.revokeKeyRecord(keyId, accountId);
}

function maskRecord(record) {
  return {
    id: record.id,
    label: record.label,
    scope: record.scope,
    createdAt: record.createdAt,
    usedAt: record.usedAt,
    revoked: record.revoked,
    status: record.revoked ? 'revoked' : record.usedAt ? 'used' : 'active',
    preview: 'aap_live_••••••••' + (record.keyHash || '').slice(0, 4),
  };
}

/** Local-testing-only in-memory `db` (keys). Swap for a real DB before deploying. */
const inMemoryDb = (() => {
  const keys = new Map();
  return {
    async saveKeyRecord(record) {
      keys.set(record.id, record);
    },
    async findKeyByHash(hash) {
      return [...keys.values()].find((k) => k.keyHash === hash) || null;
    },
    async markKeyUsed(id, usedAt) {
      const rec = keys.get(id);
      if (!rec || rec.usedAt || rec.revoked) return false; // already used/revoked — race lost
      rec.usedAt = usedAt;
      return true;
    },
    async listKeysForAccount(accountId) {
      return [...keys.values()].filter((k) => k.accountId === accountId);
    },
    async revokeKeyRecord(keyId, accountId) {
      const rec = keys.get(keyId);
      if (!rec || rec.accountId !== accountId) return false;
      rec.revoked = true;
      return true;
    },
  };
})();

/** Local-testing-only in-memory `sessionDb`. Swap for a real DB (with TTL/expiry) before deploying. */
const inMemorySessionDb = (() => {
  const sessions = new Map();
  return {
    async saveSession(session) {
      sessions.set(session.tokenHash, session);
    },
    async findSessionByHash(hash) {
      return sessions.get(hash) || null;
    },
  };
})();

module.exports = {
  createKey,
  redeemKey,
  validateSession,
  listKeys,
  revokeKey,
  hashToken,
  inMemoryDb,
  inMemorySessionDb,
};
