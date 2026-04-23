#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Command } from 'commander';
import { chromium } from 'playwright';

const ANTI_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

export async function capture({
  url, selector, viewport = { width: 1440, height: 900 }, out,
  waitForNetworkIdle = true, waitForFonts = true,
}) {
  await mkdir(dirname(out), { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: waitForNetworkIdle ? 'networkidle' : 'load' });
    await page.addStyleTag({ content: ANTI_MOTION_CSS });
    if (waitForFonts) {
      await page.evaluate(() => document.fonts?.ready);
    }
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    });

    if (selector) {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 10000 });
      await locator.screenshot({ path: out, animations: 'disabled', caret: 'hide' });
    } else {
      await page.screenshot({ path: out, animations: 'disabled', caret: 'hide', fullPage: false });
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const program = new Command();
  program
    .requiredOption('--url <url>', 'Implementation URL to capture')
    .option('--selector <sel>', 'CSS selector (omit for viewport capture)')
    .requiredOption('--out <path>', 'Output PNG path')
    .option('--width <n>', 'Viewport width', '1440')
    .option('--height <n>', 'Viewport height', '900');
  program.parse(process.argv);
  const opts = program.opts();
  await capture({
    url: opts.url,
    selector: opts.selector || null,
    viewport: { width: Number(opts.width), height: Number(opts.height) },
    out: opts.out,
  });
  console.log(JSON.stringify({ out: opts.out, ok: true }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
