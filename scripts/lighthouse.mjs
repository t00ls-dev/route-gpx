// Lighthouse audit of every page in public/sitemap.xml, the engine behind
// PageSpeed Insights, on mobile, plus the app on desktop. A new public page is
// audited once it is in the sitemap, which the SEO rules already require.
// Opt-in: it loads the real pages, with their map tiles.
//   SITE_URL  site to audit (default: the local `npm run preview` server)
//   RUNS      runs per page; scores are the median (default 1)
// Writes reports and summary.md only to the ignored .lighthouse.local/ folder
// and exits 1 when a score is below its minimum.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';

// Pinned so runs are comparable; Dependabot does not see versions run through
// npx, so the summary says when a newer release exists (see latestLighthouse).
const VERSION = '13.6.0';
const LIGHTHOUSE = `lighthouse@${VERSION}`;
const base = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const runs = Math.max(1, Number.parseInt(process.env.RUNS ?? '1', 10) || 1);
const out = '.lighthouse.local';
// Sitemap URLs name the published site; the same paths are audited on SITE_URL.
const sitemap = await fs.readFile('public/sitemap.xml', 'utf8');
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => {
  const url = new URL(loc.replaceAll('&amp;', '&'));
  return url.pathname.slice(1) + url.search;
});
if (!paths.includes('')) throw new Error('The sitemap must list the app root.');
// `help.html?lang=pt` becomes `help-pt`; the root is `app`.
const pageName = (path) => {
  const url = new URL(path, 'https://site.invalid/');
  const name = url.pathname.slice(1).replace(/\.html$/, '') || 'app';
  const lang = url.searchParams.get('lang');
  return lang ? `${name}-${lang}` : name;
};
const pages = paths.flatMap((path) => [
  { name: `${pageName(path)}-mobile`, path },
  ...(path === '' ? [{ name: 'app-desktop', path, desktop: true }] : []),
]);
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
// Performance varies between runs and runners; the map tiles make the app's
// mobile score, in every language, the most variable, so its minimum is the lowest.
// The app on desktop draws the WebGL vector map in software in the audit (no GPU),
// which held it near 78 when that map arrived; raise it as the map gets lighter.
const minimum = (page, category) => {
  if (category !== 'performance')
    return { accessibility: 95, 'best-practices': 90, seo: 95 }[category];
  if (new URL(page.path, 'https://site.invalid/').pathname !== '/') return 85;
  return page.desktop ? 75 : 60;
};
const vitals = {
  'largest-contentful-paint': 'LCP',
  'cumulative-layout-shift': 'CLS',
  'total-blocking-time': 'TBT',
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
const rows = [];
const failures = [];
for (const page of pages) {
  const url = new URL(page.path, base).href;
  const results = [];
  for (let run = 1; run <= runs; run++) {
    const prefix = `${out}/${page.name}-${run}`;
    const { status, stderr } = spawnSync(
      'npx',
      [
        '--yes',
        LIGHTHOUSE,
        url,
        '--quiet',
        '--output=json',
        '--output=html',
        `--output-path=${prefix}`,
        '--chrome-flags=--headless=new --no-sandbox',
        // No IP region lookup from the audit machine; tiles stay real.
        '--blocked-url-patterns=https://ipwho.is/*',
        ...(page.desktop ? ['--preset=desktop'] : []),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CHROME_PATH: chromium.executablePath() },
      },
    );
    if (status !== 0) {
      console.error(stderr);
      throw new Error(`Lighthouse failed for ${url}`);
    }
    results.push(
      JSON.parse(await fs.readFile(`${prefix}.report.json`, 'utf8')),
    );
  }
  const scores = Object.fromEntries(
    categories.map((category) => [
      category,
      median(
        results.map((r) => Math.round(r.categories[category].score * 100)),
      ),
    ]),
  );
  const metrics = Object.entries(vitals).map(([id, label]) => {
    const values = results.map((r) => r.audits[id].numericValue);
    const value = median(values);
    return `${label} ${id === 'cumulative-layout-shift' ? value.toFixed(3) : `${Math.round(value)} ms`}`;
  });
  for (const category of categories)
    if (scores[category] < minimum(page, category))
      failures.push(
        `${page.name} ${category} ${scores[category]} < ${minimum(page, category)}`,
      );
  rows.push(
    `| ${page.name} | ${categories.map((c) => scores[c]).join(' | ')} | ${metrics.join(', ')} |`,
  );
  console.log(page.name, scores, metrics.join(', '));
}

/** The newest Lighthouse release, or undefined when npm cannot be reached. */
function latestLighthouse() {
  const { status, stdout } = spawnSync(
    'npm',
    ['view', 'lighthouse', 'version'],
    {
      encoding: 'utf8',
    },
  );
  const version = stdout?.trim();
  return status === 0 && /^\d+\.\d+\.\d+$/.test(version) ? version : undefined;
}
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const latest = latestLighthouse();
// Informational only: the audit still passes or fails on its scores.
const versionNote = !latest
  ? `Could not check for a newer Lighthouse release than ${VERSION}.`
  : newer(latest, VERSION)
    ? `Lighthouse ${latest} is available (this audit uses ${VERSION}, which PageSpeed Insights may no longer match): update VERSION in scripts/lighthouse.mjs and review the minimums.`
    : `Lighthouse ${VERSION} is the latest release.`;
if (latest && newer(latest, VERSION) && process.env.GITHUB_ACTIONS)
  console.log(`::warning title=Lighthouse update::${versionNote}`);

const summary = [
  `## Lighthouse: ${base}`,
  '',
  `${runs} run(s) per page, median scores (${LIGHTHOUSE}).`,
  '',
  '| Page | Performance | Accessibility | Best practices | SEO | Core Web Vitals |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
  failures.length
    ? `Below the minimum:\n\n${failures.map((f) => `- ${f}`).join('\n')}`
    : 'Every score meets its minimum.',
  '',
  versionNote,
  '',
].join('\n');
await fs.writeFile(`${out}/summary.md`, summary);
console.log(`\n${summary}`);
if (failures.length) process.exitCode = 1;
