import { describe, expect, it } from 'vitest';
import {
  defaults,
  parseCoordinates,
  encodeState,
  decodeState,
  highways,
  generateGpx,
  importGpx,
  localSections,
  filename,
  type Route,
  type Step,
} from '../src/core';
const route: Route = {
  segments: [
    [
      [-22.9, -43.1],
      [-22.91, -43.11],
      [-22.92, -43.12],
    ],
    [
      [-23, -44],
      [-23.01, -44.01],
    ],
  ],
  steps: [],
  distance: 1234,
  duration: 600,
  provider: 'Test',
};
const step = (ref: string, name = 'Road', distance = 1000): Step => ({
  ref,
  name,
  distance,
  duration: 100,
});
describe('coordinates', () => {
  it.each([
    '-22.6917362, -43.4589026',
    '(-22.6917362, -43.4589026)',
    ' -22.6917362; -43.4589026 ',
  ])('parses %s in latitude, longitude order', (s) =>
    expect(parseCoordinates(s)).toEqual([-22.6917362, -43.4589026]),
  );
  it.each([
    '91,0',
    '0,-181',
    'NaN,0',
    'Infinity,1',
    '-22,5,-43,5',
    '22',
    'road name',
    '1,2 garbage',
    '1e300,4',
    '',
  ])('rejects %s', (s) => expect(parseCoordinates(s)).toBeNull());
  it('accepts valid boundaries', () =>
    expect(parseCoordinates('-90,180')).toEqual([-90, 180]));
});
describe('URL state', () => {
  it('roundtrips Unicode labels, points, options and custom server', () => {
    const s = defaults();
    s.name = 'Viagem ☀ & Tijuca';
    s.osrm = 'https://example.org/osrm';
    s.points = [
      { name: 'Café', coord: [-22, -43] },
      { name: 'Beach', coord: null },
    ];
    s.prefer = false;
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('loads an empty link', () => expect(decodeState('')).toEqual(defaults()));
  it.each(['#bad', '#v1=invalid!'])('rejects malformed links', (s) =>
    expect(() => decodeState(s)).toThrow(),
  );
  it('rejects coordinates outside Earth', () => {
    const s = defaults();
    s.points[0].coord = [100, 0];
    expect(() => decodeState(encodeState(s))).toThrow();
  });
  it('rejects script server URLs', () => {
    const s = defaults();
    s.osrm = 'javascript:alert(1)';
    expect(() => decodeState(encodeState(s))).toThrow();
  });
});
describe('road references', () => {
  it('extracts and deduplicates step references, not guesses from names', () =>
    expect(
      highways([
        step('BR-493; BR 101'),
        step('BR-101'),
        step('RJ-014'),
        step('', 'BR-999 Road'),
      ]),
    ).toEqual(['BR-493', 'BR-101', 'RJ-014']));
  it('flags long possible local sections, excluding ramps and highways', () =>
    expect(
      localSections([
        step(''),
        step('BR-101'),
        step('', 'short', 499),
        { ...step(''), kind: 'off ramp' },
        step('', 'Rodovia Gov. Mário Covas'),
      ]),
    ).toHaveLength(1));
});
describe('GPX 1.1', () => {
  it('exports every geometry point, segments, waypoint names, metadata and XML escapes', () => {
    const s = defaults();
    s.points = [
      { name: 'A < & " test', coord: [-22.9, -43.1] },
      { name: "B ' end", coord: [-23.01, -44.01] },
    ];
    const xml = generateGpx(
      route,
      s.points,
      'Route <& "\'\u0001',
      new Date('2026-01-02T12:00:00Z'),
    );
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.namespaceURI).toBe(
      'http://www.topografix.com/GPX/1/1',
    );
    expect(doc.documentElement.getAttribute('version')).toBe('1.1');
    expect(doc.querySelectorAll('trkseg')).toHaveLength(2);
    expect(doc.querySelectorAll('trkpt')).toHaveLength(5);
    expect(doc.querySelectorAll('wpt')).toHaveLength(2);
    expect(doc.querySelector('wpt name')?.textContent).toBe(s.points[0].name);
    expect(doc.querySelector('metadata name')?.textContent).toBe(
      'Route <& "\'',
    );
    expect(doc.querySelector('time')?.textContent).toBe(
      '2026-01-02T12:00:00.000Z',
    );
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
  });
  it('keeps original geometry during import, including separate segments', () => {
    const result = importGpx(generateGpx(route, defaults().points, 'Imported'));
    expect(result.route.segments).toEqual(route.segments);
    expect(result.route.duration).toBeNull();
    expect(result.points[0].coord).toEqual(route.segments[0][0]);
  });
  it.each([
    '<html/>',
    '<gpx><broken>',
    '<gpx/>',
    '<gpx><trk><trkseg><trkpt lat="NaN" lon="0"/><trkpt lat="1" lon="1"/></trkseg></trk></gpx>',
  ])('rejects invalid or empty GPX', (s) =>
    expect(() => importGpx(s)).toThrow(),
  );
  it('uses a safe filename', () =>
    expect(
      filename([
        { name: 'São / Start', coord: null },
        { name: '<End>', coord: null },
      ]),
    ).toBe('sao-start-to-end.gpx'));
});
