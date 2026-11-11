import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(__dirname, '..', path), 'utf8');

/** Release → kind → references of each entry ('' when an entry has none). */
type Outline = Record<string, Record<string, string[]>>;
const refs = (text: string) => (text.match(/#\d+/g) ?? []).join(' ');

function markdownOutline(markdown: string): Outline {
  const outline: Outline = {};
  let release = '',
    kind = '';
  for (const line of markdown.split('\n')) {
    // `## [Unreleased]` or `## [1.2.0] - 2026-12-01`: the release name.
    if (line.startsWith('## '))
      outline[(release = line.slice(3).match(/^\[([^\]]+)\]/)![1]!)] = {};
    else if (line.startsWith('### ') && release)
      outline[release]![(kind = line.slice(4).trim())] = [];
    else if (line.startsWith('- ') && release && kind)
      outline[release]![kind]!.push(refs(line));
  }
  return outline;
}

function pageOutline(article: Element): Outline {
  const outline: Outline = {};
  for (const section of article.querySelectorAll('section[data-release]')) {
    const release = section.getAttribute('data-release')!;
    outline[release] = {};
    for (const heading of section.querySelectorAll('h3[data-kind]'))
      outline[release][heading.getAttribute('data-kind')!] = [
        ...heading.nextElementSibling!.querySelectorAll('li'),
      ].map((item) => refs(item.textContent!));
  }
  return outline;
}

describe("changelog and What's new page", () => {
  const markdown = markdownOutline(read('CHANGELOG.md'));
  const page = new DOMParser().parseFromString(
    read('changelog.html'),
    'text/html',
  );

  it('follows Keep a Changelog: Unreleased first, then releases', () => {
    const releases = Object.keys(markdown);
    expect(releases[0]).toBe('Unreleased');
    for (const release of releases.slice(1))
      expect(release).toMatch(/^\d+\.\d+\.\d+$/);
    for (const kinds of Object.values(markdown))
      for (const kind of Object.keys(kinds))
        expect([
          'Added',
          'Changed',
          'Deprecated',
          'Removed',
          'Fixed',
          'Security',
        ]).toContain(kind);
  });

  it('lists the same releases, kinds and entries in both page languages', () => {
    for (const id of ['changelog-en', 'changelog-pt'])
      expect(pageOutline(page.getElementById(id)!), id).toEqual(markdown);
  });
});
