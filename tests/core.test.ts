import { describe, expect, it } from 'vitest';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import {
  defaults,
  parseCoordinates,
  encodeState,
  encodeStateV1,
  decodeState,
  validateState,
  linkServerOverrides,
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
    s.name = 'Viagem \u2600 & Tijuca';
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
describe('short v2 links', () => {
  const toLink = (payload: unknown) =>
    '#v2=' +
    btoa(
      Array.from(deflateSync(strToU8(JSON.stringify(payload))), (b) =>
        String.fromCharCode(b),
      ).join(''),
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  const payloadOf = (hash: string) =>
    JSON.parse(
      strFromU8(
        inflateSync(
          Uint8Array.from(
            atob(hash.slice(4).replaceAll('-', '+').replaceAll('_', '/')),
            (c) => c.charCodeAt(0),
          ),
        ),
      ),
    );
  const sample = () => {
    const s = defaults();
    s.name = 'Observatório / Casa';
    s.language = 'pt';
    s.averageSpeedKmh = 20;
    s.departure = '2026-11-08T09:00:00.000Z';
    s.points = [
      {
        name: 'Rua André Ricardo, Nova Iguaçu, Rio de Janeiro, Brasil',
        coord: [-22.6916306, -43.4588722],
      },
      {
        name: 'Parada Costa Verde, Rodovia Governador Mário Covas, Itaguaí, Rio de Janeiro, Brasil',
        coord: [-22.8853404, -43.8347194],
      },
      { name: 'Observatório Nuclear, 522', coord: [-23.0058113, -44.4657886] },
      { name: 'Stop 4', coord: [-22.667042962969365, -43.841988444328315] },
      {
        name: 'Rua André Ricardo, Vila Iguaçuana',
        coord: [-22.6916306, -43.4588722],
      },
    ];
    return s;
  };
  it('writes v2 links and roundtrips every option', () => {
    const s = sample();
    s.units = 'imperial';
    s.averageSpeedKmh = 16.09344; // 10 mph, already on the imperial speed step
    s.prefer = false;
    s.points.splice(1, 0, { name: 'Draft', coord: null });
    const hash = encodeState(s);
    expect(hash.startsWith('#v2=')).toBe(true);
    const back = decodeState(hash);
    expect(back.points[1]).toEqual({ name: 'Draft', coord: null });
    expect(back.points[4].coord).toEqual([-22.667043, -43.841988]);
    expect({ ...back, points: [] }).toEqual({ ...s, points: [] });
  });
  it('is much shorter than the v1 link for a typical route', () => {
    const s = sample();
    expect(encodeStateV1(s).length).toBeGreaterThan(1000);
    expect(encodeState(s).length).toBeLessThan(400);
  });
  it('omits default servers and keeps custom ones', () => {
    const s = defaults();
    expect(payloadOf(encodeState(s))).toEqual([
      [['Start'], ['Destination']],
      1,
      '',
      'm',
    ]);
    s.valhalla = 'https://example.org/valhalla';
    expect(payloadOf(encodeState(s)).at(-1)).toEqual([
      '',
      'https://example.org/valhalla',
      '',
    ]);
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('still reads v1 links', () => {
    const s = sample();
    expect(decodeState(encodeStateV1(s))).toEqual(s);
  });
  it.each([
    ['not deflate', '#v2=invalid!'],
    ['not an array', toLink({ points: [] })],
    ['a bad point', toLink([[['A', 1, 2], 'B'], 1, ''])],
    [
      'coordinates outside Earth',
      toLink([
        [
          ['A', 100, 0],
          ['B', 0, 0],
        ],
        1,
        '',
      ]),
    ],
    [
      'a non-boolean option',
      toLink([
        [
          ['A', 1, 2],
          ['B', 0, 0],
        ],
        2,
        '',
      ]),
    ],
    [
      'a script server',
      toLink([
        [
          ['A', 1, 2],
          ['B', 0, 0],
        ],
        1,
        '',
        0,
        0,
        0,
        0,
        ['javascript:alert(1)', '', ''],
      ]),
    ],
    [
      'malformed servers',
      toLink([
        [
          ['A', 1, 2],
          ['B', 0, 0],
        ],
        1,
        '',
        0,
        0,
        0,
        0,
        'x',
      ]),
    ],
  ])('rejects %s', (_, hash) => expect(() => decodeState(hash)).toThrow());
  it('rejects oversized links and payloads', () => {
    expect(() => decodeState('#v2=' + 'A'.repeat(8000))).toThrow();
    const bomb = toLink([
      [
        ['A'.repeat(300000), 1, 2],
        ['B', 0, 0],
      ],
      1,
      '',
    ]);
    expect(bomb.length).toBeLessThan(8000);
    expect(() => decodeState(bomb)).toThrow('invalid or too large');
  });
  it('validates editor and backup state without rounding coordinates', () => {
    const s = sample();
    expect(validateState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(() => validateState(null)).toThrow();
    expect(() => validateState({ ...s, points: [] })).toThrow();
  });
});
describe('link server overrides', () => {
  it('is null for default servers and returns all servers otherwise', () => {
    const s = defaults();
    expect(linkServerOverrides(s)).toBeNull();
    s.nominatim = 'https://example.org/search';
    expect(linkServerOverrides(s)).toEqual({
      osrm: s.osrm,
      valhalla: s.valhalla,
      nominatim: 'https://example.org/search',
    });
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

it('uses a safe custom GPX filename without duplicating its extension', () => {
  const points = defaults().points;
  expect(filename(points, 'Passeio <Alto> & Grumari')).toBe(
    'passeio-alto-grumari.gpx',
  );
  expect(filename(points, '../../Minha Viagem.GPX')).toBe('minha-viagem.gpx');
  expect(filename(points, '   ')).toBe(filename(points));
});
