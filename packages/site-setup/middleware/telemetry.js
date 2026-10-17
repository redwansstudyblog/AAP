/**
 * Control Panel telemetry client — for each site running the AAP middleware.
 * -----------------------------------------------------------------------
 * Talks to YOUR team's control server (package-3-control-panel), NOT to
 * individual AI agents or end users. Two jobs:
 *   1. reportAccess() — fire-and-forget usage logging (every AAP key
 *      redemption becomes one row your team can see in the dashboard).
 *   2. checkControlStatus() — "is this site blocked? is there a newer
 *      version? is this site's version below the enforced minimum?"
 *
 * SAFETY RULE: a down/unreachable control server must NEVER break AAP
 * access on the client site. Both functions fail open (silently no-op
 * / return "all clear") on any network error or timeout. The one
 * exception is a successful response that explicitly says `blocked:
 * true` or `forceUpdateRequired: true` — that must be obeyed, because
 * it's an intentional decision your team made, not a network hiccup.
 *
 * REQUIRED ENV VARS on the client site
 *   CONTROL_SERVER_URL   e.g. https://control.yourco.com
 *   CONTROL_SITE_KEY     the per-site key from registering this site
 *                         in the control panel dashboard
 *   PACKAGE_VERSION       this site's currently installed AAP middleware
 *                         version (read from your package.json, or hardcode
 *                         it and bump it on every release)
 */

const TIMEOUT_MS = 3000;

function configured() {
  return Boolean(process.env.CONTROL_SERVER_URL && process.env.CONTROL_SITE_KEY);
}

async function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * reportAccess({ event, meta })
 *   Call this right after a successful AAP key redemption (or any other
 *   event worth tracking). Never await-block your real response on
 *   this — call it and move on; errors are swallowed on purpose.
 */
async function reportAccess({ event, meta } = {}) {
  if (!configured()) return; // telemetry not set up — silently skip
  try {
    await withTimeout(
      (signal) =>
        fetch(`${process.env.CONTROL_SERVER_URL}/api/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Site-Key': process.env.CONTROL_SITE_KEY },
          body: JSON.stringify({ event, meta, version: process.env.PACKAGE_VERSION }),
          signal,
        }),
      TIMEOUT_MS
    );
  } catch (err) {
    // Fail open — telemetry failing must never break real AAP access.
  }
}

/**
 * checkControlStatus()
 *   Returns { blocked, forceUpdateRequired, updateAvailable, latestVersion, changelog, downloadUrl }.
 *   On any failure to reach the control server, returns the "all
 *   clear" default — the client site keeps working normally.
 */
async function checkControlStatus() {
  const allClear = {
    blocked: false,
    forceUpdateRequired: false,
    updateAvailable: false,
    latestVersion: null,
    changelog: null,
    downloadUrl: null,
  };
  if (!configured()) return allClear;

  try {
    const res = await withTimeout(
      (signal) =>
        fetch(
          `${process.env.CONTROL_SERVER_URL}/api/version/check?version=${encodeURIComponent(
            process.env.PACKAGE_VERSION || ''
          )}`,
          { headers: { 'X-Site-Key': process.env.CONTROL_SITE_KEY }, signal }
        ),
      TIMEOUT_MS
    );
    if (!res.ok) return allClear;
    const data = await res.json();
    if (!data.ok) return allClear;
    return {
      blocked: Boolean(data.blocked),
      forceUpdateRequired: Boolean(data.forceUpdateRequired),
      updateAvailable: Boolean(data.updateAvailable),
      latestVersion: data.latestVersion || null,
      changelog: data.changelog || null,
      downloadUrl: data.downloadUrl || null,
    };
  } catch (err) {
    return allClear; // fail open
  }
}

module.exports = { reportAccess, checkControlStatus };
