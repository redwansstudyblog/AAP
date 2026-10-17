/**
 * AI Access Protocol (AAP) — Express.js middleware
 * --------------------------------------------------
 * Drop this into any Express app to make it AAP-compliant: it serves
 * the discovery file at /.well-known/ai-access.json and protects
 * whichever routes you register with a scoped API key.
 *
 * USAGE
 *   const express = require('express');
 *   const { aapDiscovery, aapAuth } = require('./middleware/express');
 *
 *   const app = express();
 *
 *   // 1. Serve the discovery file
 *   app.get('/.well-known/ai-access.json', aapDiscovery({
 *     site: 'ClassNests',
 *     description: 'Class scheduling and student management tool.',
 *     obtainUrl: 'https://classnests.vercel.app/settings/ai-access',
 *     endpoints: [
 *       { name: 'list_classes', method: 'GET', path: '/api/ai-access/classes',
 *         description: 'Returns the list of classes for the authenticated account.' },
 *     ],
 *     rateLimit: '60 requests / minute',
 *     contact: 'support@classnests.example',
 *   }));
 *
 *   // 2. Protect your AI-facing routes with the key checker
 *   app.get('/api/ai-access/classes', aapAuth(isValidKey), (req, res) => {
 *     // req.aapKey is the validated key; req.aapAccount is whatever
 *     // isValidKey() attached to it (e.g. which account the key belongs to)
 *     res.json({ ok: true, data: getClassesFor(req.aapAccount) });
 *   });
 *
 * SECURITY NOTES
 *   - Generate keys server-side, store only a hash of the key (like a
 *     password), never the raw value.
 *   - Scope each key to the minimum set of endpoints/accounts it needs.
 *   - Rate-limit at the key level, not just globally, so one leaked key
 *     can't be used to hammer the whole API.
 *   - Always return JSON 401s for bad auth, never redirect to an HTML
 *     login page — that's what keeps this machine-readable.
 */

function aapDiscovery(config) {
  return function (req, res) {
    res.json({
      aap_version: '0.1',
      site: config.site,
      description: config.description || '',
      auth: {
        type: 'api_key',
        header: config.header || 'X-AAP-Key',
        obtain_url: config.obtainUrl,
      },
      endpoints: config.endpoints || [],
      rate_limit: config.rateLimit || 'unspecified',
      contact: config.contact || '',
    });
  };
}

/**
 * aapAuth(validateKeyFn, options?)
 *   validateKeyFn(key) -> Promise<account|null> | account|null
 *     Return a truthy value (e.g. the account/user the key belongs to)
 *     if the key is valid; return null/false/undefined if not.
 *   options.header — header name to read the key from (default 'x-aap-key')
 */
function aapAuth(validateKeyFn, options = {}) {
  const headerName = (options.header || 'x-aap-key').toLowerCase();

  return async function (req, res, next) {
    const key = req.headers[headerName];

    if (!key) {
      return res.status(401).json({
        ok: false,
        error: `Missing ${headerName} header. See /.well-known/ai-access.json for how to authenticate.`,
      });
    }

    let account;
    try {
      account = await validateKeyFn(key);
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Key validation failed unexpectedly.' });
    }

    if (!account) {
      return res.status(401).json({ ok: false, error: 'Invalid or revoked API key.' });
    }

    req.aapKey = key;
    req.aapAccount = account;
    next();
  };
}

module.exports = { aapDiscovery, aapAuth };
