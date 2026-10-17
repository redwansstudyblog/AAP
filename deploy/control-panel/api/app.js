/**
 * AAP Control Panel — Express app (Vercel serverless version)
 * -----------------------------------------------------------
 * Same routes as the original packages/control-panel/server/index.js,
 * minus app.listen() (Vercel calls this as a serverless function
 * instead of a long-running process) and minus the static-file
 * middleware (the dashboard is served by Vercel directly from /index.html).
 *
 * NOTE: db.js is the in-memory storage layer copied as-is from the
 * original package. On Vercel, each serverless invocation can run on
 * a fresh instance, so data stored this way is NOT guaranteed to
 * persist between requests. This is fine for a first working deploy /
 * demo, but swap it for a real database (Postgres, Vercel KV/Blob,
 * etc.) before relying on it for real usage tracking.
 */

const express = require('express');
const db = require('../db');

const app = express();
app.use(express.json());

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

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

// SITE-FACING ROUTES
app.post('/api/admin/sites', requireAdmin, async (req, res) => {
  const { domain, label } = req.body || {};
  if (!domain) return res.status(400).json({ ok: false, error: 'domain is required.' });
  const { siteId, rawSiteKey } = await db.registerSite({ domain, label });
  res.json({ ok: true, siteId, siteKey: rawSiteKey });
});

app.post('/api/heartbeat', requireSite, async (req, res) => {
  const { event, meta, version } = req.body || {};
  await db.touchSite(req.site.id, { version });
  if (event) {
    await db.logAccess({ siteId: req.site.id, event, meta });
  }
  res.json({ ok: true });
});

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

// ADMIN ROUTES
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

module.exports = app;
