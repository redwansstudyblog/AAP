/**
 * AAP Control Panel — server
 * -----------------------------------------------------------
 * A small Express app your team hosts (NOT installed on client sites).
 * It does three jobs:
 *   1. Registers sites and issues each one a "site key" (different from
 *      AAP end-user keys — this one identifies the SITE to you).
 *   2. Receives usage telemetry from each site's middleware (how many
 *      times AI accessed it, when) and lets you block a site.
 *   3. Publishes package releases (version, changelog, optional
 *      minimum-required-version) that sites check against.
 *
 * RUN
 *   npm install
 *   ADMIN_TOKEN=choose-a-long-random-string node server/index.js
 *
 * ADMIN AUTH
 *   Every /api/admin/* route requires:
 *     Authorization: Bearer <ADMIN_TOKEN>
 *   This is intentionally simple (single shared token) for an internal
 *   tool. Before exposing this server to the public internet, put it
 *   behind your own team's SSO/login, or at least restrict it by IP —
 *   a leaked ADMIN_TOKEN gives full control (block any site, publish
 *   fake releases).
 */

const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  console.warn('WARNING: ADMIN_TOKEN is not set. Admin routes will reject all requests.');
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Invalid or missing admin token.' });
  }
  next();
}

async function requireSite(req, res, next) {
  const siteKey = req.headers['x-site-key'];
  if (!siteKey) {
    return res.status(401).json({ ok: false, error: 'Missing X-Site-Key header.' });
  }
  const site = await db.findSiteByRawKey(siteKey);
  if (!site) {
    return res.status(401).json({ ok: false, error: 'Unknown site key.' });
  }
  req.site = site;
  next();
}

// =====================================================================
// SITE-FACING ROUTES — called by the AAP middleware on each client site
// =====================================================================

/**
 * Called once by a site owner (manually, or by your setup script) to
 * register a new site and get back its site key. This is an admin
 * action, so it's protected the same as the rest of /api/admin.
 */
app.post('/api/admin/sites', requireAdmin, async (req, res) => {
  const { domain, label } = req.body || {};
  if (!domain) return res.status(400).json({ ok: false, error: 'domain is required.' });
  const { siteId, rawSiteKey } = await db.registerSite({ domain, label });
  // rawSiteKey is shown ONCE — the admin must copy it into that site's env vars now.
  res.json({ ok: true, siteId, siteKey: rawSiteKey });
});

/**
 * Called by a site's middleware whenever something happens worth
 * tracking — most importantly, every successful AAP key redemption
 * (i.e. every time an AI actually accessed the site). Never let a
 * failure here block the real AAP flow — the client should fire this
 * and ignore errors/timeouts (see telemetry.js in package 1).
 */
app.post('/api/heartbeat', requireSite, async (req, res) => {
  const { event, meta, version } = req.body || {};
  await db.touchSite(req.site.id, { version });
  if (event) {
    await db.logAccess({ siteId: req.site.id, event, meta });
  }
  res.json({ ok: true });
});

/**
 * Called by a site's middleware (e.g. before redeeming a key, and/or
 * periodically) to check: is this site blocked? Is there a newer
 * version? Is the current version below the enforced minimum?
 * The client should FAIL OPEN on network errors to this endpoint —
 * don't let your control server's downtime break every client site.
 * A `blocked: true` or `forceUpdateRequired: true` response, when it
 * DOES arrive successfully, should be obeyed strictly.
 */
app.get('/api/version/check', requireSite, async (req, res) => {
  const currentVersion = req.query.version || null;
  const latest = await db.latestRelease();
  const blocked = req.site.status === 'blocked';

  const forceUpdateRequired = Boolean(
    latest && latest.minVersion && currentVersion && isOlder(currentVersion, latest.minVersion)
  );

  res.json({
    ok: true,
    blocked,
    latestVersion: latest ? latest.version : null,
    minVersion: latest ? latest.minVersion : null,
    forceUpdateRequired,
    updateAvailable: Boolean(latest && currentVersion && isOlder(currentVersion, latest.version)),
    changelog: latest ? latest.changelog : null,
    downloadUrl: latest ? latest.downloadUrl : null,
  });
});

function isOlder(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

// =====================================================================
// ADMIN ROUTES — the dashboard calls these
// =====================================================================

app.get('/api/admin/sites', requireAdmin, async (req, res) => {
  const list = await db.listSites();
  const withCounts = await Promise.all(
    list.map(async (s) => ({
      ...s,
      siteKeyHash: undefined,
      accessCount: await db.countAccessForSite(s.id),
    }))
  );
  res.json({ ok: true, sites: withCounts });
});

app.get('/api/admin/sites/:id/logs', requireAdmin, async (req, res) => {
  const logs = await db.recentAccessForSite(req.params.id, 50);
  res.json({ ok: true, logs });
});

app.post('/api/admin/sites/:id/block', requireAdmin, async (req, res) => {
  const okSet = await db.setSiteStatus(req.params.id, 'blocked');
  if (!okSet) return res.status(404).json({ ok: false, error: 'Site not found.' });
  res.json({ ok: true });
});

app.post('/api/admin/sites/:id/unblock', requireAdmin, async (req, res) => {
  const okSet = await db.setSiteStatus(req.params.id, 'active');
  if (!okSet) return res.status(404).json({ ok: false, error: 'Site not found.' });
  res.json({ ok: true });
});

app.post('/api/admin/releases', requireAdmin, async (req, res) => {
  const { version, changelog, minVersion, downloadUrl } = req.body || {};
  if (!version) return res.status(400).json({ ok: false, error: 'version is required.' });
  const release = await db.publishRelease({ version, changelog, minVersion, downloadUrl });
  res.json({ ok: true, release });
});

app.get('/api/admin/releases', requireAdmin, async (req, res) => {
  const list = await db.listReleases();
  res.json({ ok: true, releases: list });
});

// Serve the static dashboard
app.use('/', express.static(require('path').join(__dirname, '..', 'dashboard')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AAP Control Panel server listening on http://localhost:${PORT}`);
});

module.exports = app;
