#!/usr/bin/env node
//
// Regenerates the README screenshots from the running application.
//
//   pnpm build && pnpm preview --port 4173 --strictPort &
//   node scripts/screenshots.mjs
//
// Shot from the real app on the committed fixtures, so the pictures can never
// show data the app could not produce.

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../docs/images');
const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173';

const SHOTS = [
  {
    name: 'query',
    path: '/?query=France+river+Paris&chunk=seine',
    theme: 'light',
  },
  {
    name: 'query-dark',
    path: '/?query=France+river+Paris&chunk=seine',
    theme: 'dark',
  },
  { name: 'diff', path: '/diff?query=France+river+Paris', theme: 'light' },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 820 },
    deviceScaleFactor: 2,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  // The panes settle after the explanation query resolves; without this the
  // screenshot can catch a half-rendered detail pane.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  await context.close();
  process.stdout.write(`✓ ${shot.name}.png\n`);
}

await browser.close();
