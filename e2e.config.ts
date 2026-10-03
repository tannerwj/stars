// e2e.config.ts — Triangulum Stellar Triangulation Observatory.
//
// Deterministic suite only (no agent/model): tests use app, screen,
// browser, expect. The app is a static site; tests run against production
// (https://stars.tannerwj.com) because sandbox Chromium cannot reach
// localhost. The browser is a locally launched Chromium
// (/opt/meta-chromium/chrome --headless --remote-debugging-port=9222
// --proxy-server=http://127.0.0.1:18080) attached over CDP; start
// scripts/e2e-chrome.sh first (it also starts the proxy forwarder).
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

const connect = {
  // Resolver form: the runner calls it per lease. scripts/e2e-chrome.sh
  // launches this repo's dedicated Chromium (E2E_CDP_PORT, default 9223);
  // E2E_CDP overrides the endpoint outright when set.
  cdpEndpoint: () =>
    process.env.E2E_CDP || `http://127.0.0.1:${process.env.E2E_CDP_PORT || 9223}`,
};

const app = { url: 'https://stars.tannerwj.com' };

export default {
  tests: 'tests/e2e/*.e2e.ts',
  timeout: 120_000,
  workers: 2,
  targets: [
    {
      name: 'desktop',
      engine: web({ viewport: { width: 1440, height: 900 }, connect }),
      app,
    },
    {
      name: 'tablet',
      engine: web({ viewport: { width: 834, height: 1112 }, connect }),
      app,
    },
    {
      name: 'mobile',
      engine: web({ viewport: { width: 390, height: 844 }, connect }),
      app,
    },
  ],
} satisfies E2EConfig;
