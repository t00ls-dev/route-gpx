import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalUrl, updateSeo } from '../src/seo';
import config from '../vite.config';

const read = (path: string) =>
  readFileSync(resolve(__dirname, '..', path), 'utf8');
const pages = [
  ['app', 'index.html'],
  ['help', 'help.html'],
  ['changelog', 'changelog.html'],
] as const;
const languages = ['en', 'pt'] as const;
const content = (selector: string) =>
  document.querySelector(selector)?.getAttribute('content');
const canonical = () =>
  document.querySelector('link[rel=canonical]')?.getAttribute('href');
const alternates = () =>
  [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(
    (link) => [link.getAttribute('hreflang'), link.getAttribute('href')],
  );

function load(file: string) {
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    read(file),
    'text/html',
  ).documentElement.innerHTML;
}

describe('SEO metadata', () => {
  it('every built page is covered here, and so in the sitemap and Lighthouse', () => {
    // scripts/lighthouse.mjs audits the sitemap, which the last test below
    // compares with these pages: a new Vite entry must be added to `pages`.
    const input = config.build?.rollupOptions?.input as Record<string, string>;
    expect(Object.values(input).sort()).toEqual(
      pages.map(([, file]) => file).sort(),
    );
  });

  it.each(pages)(
    '%s initial HTML matches its runtime English metadata',
    (page, file) => {
      load(file);
      const initial = {
        title: document.title,
        description: content('meta[name="description"]'),
        url: content('meta[property="og:url"]'),
      };
      expect(content('meta[property="og:title"]')).toBe(initial.title);
      expect(content('meta[name="twitter:title"]')).toBe(initial.title);
      expect(content('meta[property="og:description"]')).toBe(
        initial.description,
      );
      expect(content('meta[name="twitter:description"]')).toBe(
        initial.description,
      );
      expect(initial.url).toBe(canonicalUrl('en', page));
      updateSeo('en', page);
      expect(document.title).toBe(initial.title);
      expect(content('meta[name="description"]')).toBe(initial.description);
      expect(canonical()).toBe(canonicalUrl('en', page));
    },
  );

  it.each(pages)('%s titles and descriptions stay concise', (page, file) => {
    load(file);
    for (const language of languages) {
      updateSeo(language, page);
      expect(document.title.length).toBeLessThanOrEqual(60);
      expect(content('meta[name="description"]')!.length).toBeLessThanOrEqual(
        160,
      );
    }
  });

  it.each(pages)(
    '%s has a canonical URL per language and matching hreflang alternates',
    (page, file) => {
      load(file);
      // The raw HTML must not declare the English URL canonical for Portuguese.
      expect(canonical()).toBeUndefined();
      expect(alternates()).toEqual([
        ['en', canonicalUrl('en', page)],
        ['pt-BR', canonicalUrl('pt', page)],
        ['x-default', canonicalUrl('en', page)],
      ]);
      updateSeo('pt', page);
      expect(canonical()).toBe(canonicalUrl('pt', page));
      expect(content('meta[property="og:url"]')).toBe(canonicalUrl('pt', page));
      updateSeo('en', page);
      expect(canonical()).toBe(canonicalUrl('en', page));
      expect(document.querySelectorAll('link[rel=canonical]')).toHaveLength(1);
    },
  );

  it('JSON-LD describes the app with its meta description', () => {
    load('index.html');
    const schema = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')!
        .textContent!,
    );
    expect(schema.description).toBe(content('meta[name="description"]'));
    expect(schema.url).toBe(canonicalUrl('en', 'app'));
  });

  it('sitemap lists every canonical URL with a valid lastmod and the page alternates', () => {
    const sitemap = new DOMParser().parseFromString(
      read('public/sitemap.xml'),
      'application/xml',
    );
    expect(sitemap.getElementsByTagName('parsererror')).toHaveLength(0);
    const entries = [...sitemap.getElementsByTagName('url')].map((url) => ({
      loc: url.getElementsByTagName('loc')[0]?.textContent,
      lastmod: url.getElementsByTagName('lastmod')[0]?.textContent ?? '',
      alternates: [...url.getElementsByTagName('xhtml:link')].map((link) => [
        link.getAttribute('hreflang'),
        link.getAttribute('href'),
      ]),
    }));
    const expected = pages.flatMap(([page, file]) => {
      load(file);
      const urls = new Set(languages.map((l) => canonicalUrl(l, page)));
      return [...urls].map((loc) => ({ loc, alternates: alternates() }));
    });
    expect(entries.map(({ loc, alternates }) => ({ loc, alternates }))).toEqual(
      expected,
    );
    for (const { lastmod } of entries) {
      expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${lastmod}T00:00:00Z`).toISOString()).toContain(lastmod);
    }
  });
});
