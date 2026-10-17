#!/usr/bin/env node
/**
 * site-login-automation / login.js
 * ----------------------------------------------------------------
 * A standalone, AI-agnostic login script built on Playwright.
 *
 * WHAT THIS DOES
 *   - Opens the given URL in a real browser
 *   - Auto-detects a login form (or uses selectors you provide)
 *   - Fills in the username/email + password
 *   - Submits, waits for navigation, and reports success/failure
 *   - Saves a screenshot + the post-login HTML so an AI agent (or a
 *     human) can inspect the authenticated page afterwards
 *   - Saves the browser's storage state (cookies/localStorage) to a
 *     file, so later steps can reuse the session WITHOUT re-entering
 *     the password
 *
 * WHAT THIS DOES NOT DO (by design)
 *   - It never tries a credential on a domain other than the one
 *     passed in --url. There is no "credential list" or "try all of
 *     these" mode. One run = one site = one explicit credential.
 *   - It never attempts to solve CAPTCHAs or bypass 2FA. If one is
 *     detected, it stops and reports that, so a human/agent can
 *     handle it (e.g. supply an OTP via --otp).
 *   - It never retries a failed login more than once automatically,
 *     to avoid triggering account lockouts.
 *
 * INSTALL
 *   npm init -y
 *   npm install playwright
 *   npx playwright install chromium
 *
 * USAGE
 *   # Preferred: credentials via environment variables, not CLI args
 *   # (CLI args can leak into shell history / process lists)
 *   SITE_USER="me@example.com" SITE_PASS="••••••••" \
 *     node login.js --url https://example.com/login --out ./session
 *
 *   # Optional flags:
 *   --headless=false        show the browser window (debugging)
 *   --otp=123456            one-time 2FA code, if you already have it
 *   --user-field=selector   override auto-detected username field
 *   --pass-field=selector   override auto-detected password field
 *   --submit=selector       override auto-detected submit button
 *   --timeout=30000         ms to wait for navigation/selectors
 *
 * OUTPUT (written to --out, default "./login-output")
 *   result.json        { success, message, finalUrl }
 *   after-login.png     screenshot of the page right after login
 *   page.html            HTML of the authenticated page
 *   storage-state.json  cookies/localStorage, reusable via Playwright's
 *                        `storageState` option so you don't need to
 *                        log in again for follow-up actions
 * ----------------------------------------------------------------
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { headless: true, timeout: 30000, out: './login-output' };
  for (const raw of argv.slice(2)) {
    const [flag, ...rest] = raw.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (flag === 'headless') args.headless = value !== 'false';
    else if (flag === 'timeout') args.timeout = parseInt(value, 10);
    else args[toCamel(flag)] = value;
  }
  return args;
}

function toCamel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// Common selectors to try, in order, when the caller doesn't supply one.
const USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[id*="email" i]',
  'input[name="username"]',
  'input[id*="user" i]',
  'input[autocomplete="username"]',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Sign in")',
  'button:has-text("লগইন")',
];

const TWO_FACTOR_HINTS = [
  'input[name*="otp" i]',
  'input[name*="code" i]',
  'text=verification code',
  'text=two-factor',
  'text=2FA',
];

async function findFirst(page, selectors) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
      return { selector: sel, locator: el };
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.url) {
    console.error('Error: --url is required.');
    process.exit(1);
  }

  const username = process.env.SITE_USER || args.user;
  const password = process.env.SITE_PASS || args.pass;

  if (!username || !password) {
    console.error(
      'Error: credentials not found. Set SITE_USER and SITE_PASS environment ' +
      'variables (preferred), or pass --user and --pass explicitly.\n' +
      'This script will NOT guess or reuse credentials from another site.'
    );
    process.exit(1);
  }

  fs.mkdirSync(args.out, { recursive: true });

  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const result = { success: false, message: '', finalUrl: null };

  try {
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: args.timeout });

    // --- locate username field ---
    const userField = args.userField
      ? { selector: args.userField, locator: page.locator(args.userField).first() }
      : await findFirst(page, USERNAME_SELECTORS);

    // --- locate password field ---
    const passField = args.passField
      ? { selector: args.passField, locator: page.locator(args.passField).first() }
      : await findFirst(page, PASSWORD_SELECTORS);

    if (!passField) {
      result.message = 'No password field detected on this page. Is this really a login page? ' +
        'If the form is custom, pass --user-field / --pass-field / --submit explicitly.';
      await saveOutputs(page, args.out, result);
      await browser.close();
      process.exit(2);
    }

    if (userField) {
      await userField.locator.fill(username);
    }
    await passField.locator.fill(password);

    // --- submit ---
    const submit = args.submit
      ? { selector: args.submit, locator: page.locator(args.submit).first() }
      : await findFirst(page, SUBMIT_SELECTORS);

    if (submit) {
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: args.timeout }).catch(() => {}),
        submit.locator.click(),
      ]);
    } else {
      // fall back to pressing Enter in the password field
      await passField.locator.press('Enter');
      await page.waitForLoadState('networkidle', { timeout: args.timeout }).catch(() => {});
    }

    // --- check for 2FA / OTP prompt ---
    const twoFactor = await findFirst(page, TWO_FACTOR_HINTS);
    if (twoFactor && !args.otp) {
      result.message = 'A 2FA / one-time-code prompt appeared. Re-run with --otp=<code> ' +
        'once you have the code. This script will not attempt to bypass 2FA.';
      await saveOutputs(page, args.out, result);
      await browser.close();
      process.exit(3);
    }
    if (twoFactor && args.otp) {
      await twoFactor.locator.fill(args.otp);
      const otpSubmit = await findFirst(page, SUBMIT_SELECTORS);
      if (otpSubmit) {
        await Promise.all([
          page.waitForLoadState('networkidle', { timeout: args.timeout }).catch(() => {}),
          otpSubmit.locator.click(),
        ]);
      } else {
        await twoFactor.locator.press('Enter');
      }
    }

    // --- verify login success (heuristics) ---
    const stillHasPasswordField = await page.locator('input[type="password"]').first()
      .isVisible().catch(() => false);
    const hasLogoutHint = await page.locator(
      'text=/log ?out/i, text=/sign ?out/i, a[href*="logout" i]'
    ).first().isVisible().catch(() => false);
    const errorHint = await page.locator(
      'text=/incorrect/i, text=/invalid/i, text=/wrong password/i, [role="alert"]'
    ).first().textContent().catch(() => null);

    result.finalUrl = page.url();

    if (errorHint) {
      result.message = `Login appears to have failed. Site message: "${errorHint.trim()}"`;
    } else if (stillHasPasswordField) {
      result.message = 'Login form is still showing after submit — login likely failed.';
    } else {
      result.success = true;
      result.message = hasLogoutHint
        ? 'Login succeeded (found a logout/sign-out indicator).'
        : 'Login likely succeeded (no password field or error detected), but could not ' +
          'positively confirm via a logout link — please sanity-check the screenshot.';

      // Save the authenticated session so follow-up steps don't need
      // to log in again.
      await context.storageState({ path: path.join(args.out, 'storage-state.json') });
    }

    await saveOutputs(page, args.out, result);
  } catch (err) {
    result.message = `Unexpected error: ${err.message}`;
    await saveOutputs(page, args.out, result).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

async function saveOutputs(page, outDir, result) {
  try {
    await page.screenshot({ path: path.join(outDir, 'after-login.png'), fullPage: true });
  } catch (_) {}
  try {
    const html = await page.content();
    fs.writeFileSync(path.join(outDir, 'page.html'), html);
  } catch (_) {}
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
}

main();
