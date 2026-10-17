/**
 * Control Panel — storage layer
 * -----------------------------------------------------------
 * In-memory implementation for local testing. Swap every function
 * here for real database calls (Postgres/MongoDB/etc.) before
 * deploying — everything is lost on restart otherwise.
 *
 * TABLES
 *   sites         — one row per website that has the AAP middleware installed
 *   access_logs   — one row per AAP key redemption (usage event) on a site
 *   releases      — one row per published package version
 */

const crypto = require('crypto');

function hash(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const sites = new Map();        // siteId -> site record
const siteKeyIndex = new Map(); // hashed site-api-key -> siteId
const accessLogs = [];          // array of log entries
const releases = [];            // array of { version, publishedAt, changelog, minVersion, downloadUrl }

const db = {
  // ---- sites ----
  async registerSite({ domain, label }) {
    const siteId = crypto.randomUUID();
    const rawSiteKey = 'ctrl_' + crypto.randomBytes(20).toString('hex');
    const record = {
      id: siteId,
      domain,
      label: label || domain,
      siteKeyHash: hash(rawSiteKey),
      currentVersion: null,
      status: 'active', // 'active' | 'blocked'
      createdAt: new Date().toISOString(),
      lastSeenAt: null,
    };
    sites.set(siteId, record);
    siteKeyIndex.set(record.siteKeyHash, siteId);
    return { siteId, rawSiteKey };
  },

  async findSiteByRawKey(rawSiteKey) {
    const siteId = siteKeyIndex.get(hash(rawSiteKey));
    return siteId ? sites.get(siteId) : null;
  },

  async getSite(siteId) {
    return sites.get(siteId) || null;
  },

  async listSites() {
    return [...sites.values()];
  },

  async setSiteStatus(siteId, status) {
    const s = sites.get(siteId);
    if (!s) return false;
    s.status = status;
    return true;
  },

  async touchSite(siteId, { version }) {
    const s = sites.get(siteId);
    if (!s) return false;
    s.lastSeenAt = new Date().toISOString();
    if (version) s.currentVersion = version;
    return true;
  },

  // ---- access logs ----
  async logAccess({ siteId, event, meta }) {
    accessLogs.push({
      id: crypto.randomUUID(),
      siteId,
      event, // e.g. 'key_redeemed', 'task_call'
      meta: meta || {},
      timestamp: new Date().toISOString(),
    });
  },

  async countAccessForSite(siteId) {
    return accessLogs.filter((l) => l.siteId === siteId).length;
  },

  async recentAccessForSite(siteId, limit = 20) {
    return accessLogs
      .filter((l) => l.siteId === siteId)
      .slice(-limit)
      .reverse();
  },

  // ---- releases ----
  async publishRelease({ version, changelog, minVersion, downloadUrl }) {
    const release = {
      version,
      changelog: changelog || '',
      minVersion: minVersion || null, // if set, sites below this MUST update
      downloadUrl: downloadUrl || null,
      publishedAt: new Date().toISOString(),
    };
    releases.push(release);
    return release;
  },

  async latestRelease() {
    return releases.length ? releases[releases.length - 1] : null;
  },

  async listReleases() {
    return [...releases].reverse();
  },
};

module.exports = db;
