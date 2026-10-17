/**
 * AI Access Protocol (AAP) — Next.js (App Router) helpers
 * ----------------------------------------------------------
 * Works for sites hosted on Vercel built with Next.js — the most
 * common stack for a "*.vercel.app" site.
 *
 * FILE 1: app/.well-known/ai-access.json/route.js
 * -------------------------------------------------
 *   import { aapDiscoveryResponse } from '@/middleware/nextjs';
 *
 *   export async function GET() {
 *     return aapDiscoveryResponse({
 *       site: 'ClassNests',
 *       description: 'Class scheduling and student management tool.',
 *       obtainUrl: 'https://classnests.vercel.app/settings/ai-access',
 *       endpoints: [
 *         { name: 'list_classes', method: 'GET', path: '/api/ai-access/classes',
 *           description: 'Returns the list of classes for the authenticated account.' },
 *       ],
 *       rateLimit: '60 requests / minute',
 *       contact: 'support@classnests.example',
 *     });
 *   }
 *
 * FILE 2: app/api/ai-access/classes/route.js
 * -------------------------------------------------
 *   import { requireAapKey } from '@/middleware/nextjs';
 *
 *   export async function GET(request) {
 *     const auth = await requireAapKey(request, isValidKey);
 *     if (auth.error) return auth.error; // already a 401 Response
 *
 *     const data = await getClassesFor(auth.account);
 *     return Response.json({ ok: true, data });
 *   }
 *
 * isValidKey(key) must be supplied by the site — look it up against a
 * hashed-key store, return the owning account, or null if invalid.
 */

function aapDiscoveryResponse(config) {
  return Response.json({
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
}

async function requireAapKey(request, validateKeyFn, options = {}) {
  const headerName = options.header || 'x-aap-key';
  const key = request.headers.get(headerName);

  if (!key) {
    return {
      error: Response.json(
        {
          ok: false,
          error: `Missing ${headerName} header. See /.well-known/ai-access.json for how to authenticate.`,
        },
        { status: 401 }
      ),
    };
  }

  let account;
  try {
    account = await validateKeyFn(key);
  } catch (err) {
    return {
      error: Response.json({ ok: false, error: 'Key validation failed unexpectedly.' }, { status: 500 }),
    };
  }

  if (!account) {
    return {
      error: Response.json({ ok: false, error: 'Invalid or revoked API key.' }, { status: 401 }),
    };
  }

  return { account, key };
}

module.exports = { aapDiscoveryResponse, requireAapKey };
