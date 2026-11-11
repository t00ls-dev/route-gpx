import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(__dirname, '..', path), 'utf8');

const KINDS = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
];

interface Release {
  name: string;
  date?: string;
  /** Kind → references of each entry ('' when an entry has none). */
  kinds: Record<string, string[]>;
}
const refs = (text: string) => (text.match(/#\d+/g) ?? []).join(' ');

/** `## [Unreleased]` and `## [1.2.0] - 2026-12-01` sections of CHANGELOG.md. */
function markdownReleases(markdown: string): Release[] {
  const releases: Release[] = [];
  let kind = '';
  for (const line of markdown.split('\n')) {
    const heading = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/.exec(line);
    const release = releases.at(-1);
    if (line.startsWith('## ')) {
      expect(heading, line).not.toBeNull();
      releases.push({ name: heading![1]!, date: heading![2], kinds: {} });
    } else if (line.startsWith('### ') && release)
      release.kinds[(kind = line.slice(4).trim())] = [];
    else if (line.startsWith('- ') && release && kind)
      release.kinds[kind]!.push(refs(line));
  }
  return releases;
}

function pageReleases(article: Element): Release[] {
  return [...article.querySelectorAll('section[data-release]')].map(
    (section) => {
      const kinds: Release['kinds'] = {};
      for (const heading of section.querySelectorAll('h3[data-kind]'))
        kinds[heading.getAttribute('data-kind')!] = [
          ...heading.nextElementSibling!.querySelectorAll('li'),
        ].map((item) => refs(item.textContent!));
      return {
        name: section.getAttribute('data-release')!,
        date:
          section.querySelector('h2 time')?.getAttribute('datetime') ??
          undefined,
        kinds,
      };
    },
  );
}

describe("changelog and What's new page", () => {
  const markdown = read('CHANGELOG.md');
  const releases = markdownReleases(markdown);
  const page = new DOMParser().parseFromString(
    read('changelog.html'),
    'text/html',
  );

  it('follows Keep a Changelog: Unreleased, then dated releases, newest first', () => {
    expect(releases[0]).toMatchObject({ name: 'Unreleased', date: undefined });
    const versions = releases.slice(1);
    expect(versions.length).toBeGreaterThan(0);
    for (const release of versions) {
      expect(release.name).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.date, release.name).toBeDefined();
      expect(markdown).toContain(
        `[${release.name}]: https://github.com/t00ls-dev/route-gpx/releases/tag/v${release.name}`,
      );
    }
    const order = (r: Release) =>
      r.name
        .split('.')
        .map((part) => part.padStart(6, '0'))
        .join('.');
    expect(versions.map(order)).toEqual(versions.map(order).sort().reverse());
    expect(versions.map((r) => r.date)).toEqual(
      versions
        .map((r) => r.date)
        .sort()
        .reverse(),
    );
    for (const release of releases)
      for (const kind of Object.keys(release.kinds))
        expect(KINDS).toContain(kind);
  });

  it('matches the version in package.json to the latest release', () => {
    const { version } = JSON.parse(read('package.json')) as {
      version: string;
    };
    expect(releases[1]!.name).toBe(version);
  });

  it('lists the same releases, dates, kinds and entries in both page languages', () => {
    // An empty Unreleased section is not shown on the page.
    const shown = releases.filter((r) => Object.keys(r.kinds).length);
    for (const id of ['changelog-en', 'changelog-pt'])
      expect(pageReleases(page.getElementById(id)!), id).toEqual(shown);
  });
});
