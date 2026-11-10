import { describe, expect, it } from 'vitest';
import { gzipSync, zipSync } from 'fflate';
import { importedProvider, importGpx, importTrackFile } from '../src/core';
import { be, Fit, le, name, recordFields, semi } from './fit-fixture';

const text = (s: string) => new TextEncoder().encode(s);

describe('FIT import', () => {
  it('reads a course: name, positions, altitude and course points', () => {
    const fit = new Fit()
      .define(1, 31, [[5, 16, 0x07]])
      .data(1, name('Serra loop'))
      .define(0, 20, recordFields);
    for (let i = 0; i < 5; i++)
      fit.record(-22.9, -43.2 + i * 0.01, 100 + i * 10);
    fit
      .define(2, 32, [
        [2, 4, 0x85],
        [3, 4, 0x85],
        [6, 16, 0x07],
      ])
      .data(2, le(semi(-22.9), 4), le(semi(-43.18), 4), name('Viewpoint'));
    const imported = importTrackFile(fit.file());
    expect(imported.name).toBe('Serra loop');
    expect(imported.route.provider).toBe('Imported FIT');
    expect(imported.route.segments).toHaveLength(1);
    expect(imported.route.segments[0]).toHaveLength(5);
    expect(imported.route.segments[0][4][0]).toBeCloseTo(-22.9, 6);
    expect(imported.route.segments[0][4][1]).toBeCloseTo(-43.16, 6);
    expect(imported.elevations![0]).toEqual([100, 110, 120, 130, 140]);
    expect(imported.points.map((p) => p.name)).toEqual([
      'Start',
      'Viewpoint',
      'Destination',
    ]);
  });

  it('skips records without position and splits only after a long missing stretch', () => {
    const fit = new Fit().define(0, 20, recordFields);
    fit.record(-22.9, -43.2).record(-22.9, -43.199);
    fit.record(null, null); // short GPS loss: same segment
    fit.record(-22.9, -43.198).record(-22.9, -43.197);
    fit.record(null, null); // positions missing over about 10 km
    fit.record(-22.9, -43.1).record(-22.9, -43.099);
    const segments = importTrackFile(fit.file()).route.segments;
    expect(segments.map((s) => s.length)).toEqual([4, 2]);
  });

  it('handles big-endian definitions, compressed timestamp headers and skips developer fields', () => {
    const fit = new Fit().define(0, 20, recordFields, true, [3]);
    const big = (lat: number, lon: number) => [
      ...be(semi(lat), 4),
      ...be(semi(lon), 4),
      ...be(0xffff, 2),
      7,
      7,
      7,
    ];
    fit.data(0, big(-22.9, -43.2));
    // Compressed timestamp header for local message 0.
    fit.data(0x80 | (0 << 5) | 5, big(-22.9, -43.19));
    const imported = importTrackFile(fit.file());
    expect(imported.route.segments[0]).toHaveLength(2);
    expect(imported.route.segments[0][1][1]).toBeCloseTo(-43.19, 6);
    expect(imported.elevations).toBeUndefined();
  });

  it('rejects damaged, truncated and position-less files', () => {
    const fit = new Fit().define(0, 20, recordFields);
    fit.record(-22.9, -43.2).record(-22.9, -43.19);
    const good = fit.file();
    const damaged = good.slice();
    damaged[20] ^= 0xff;
    expect(() => importTrackFile(damaged)).toThrow('checksum');
    expect(() => importTrackFile(good.slice(0, good.length - 6))).toThrow(
      'truncated',
    );
    const empty = new Fit().define(0, 20, recordFields).record(null, null);
    expect(() => importTrackFile(empty.file())).toThrow(
      'No track or route geometry found in this FIT.',
    );
    // A data message whose definition never appeared.
    const orphan = new Fit().data(3, [1, 2, 3]);
    expect(() => importTrackFile(orphan.file())).toThrow(
      'This file is not a valid FIT.',
    );
  });
});

describe('TCX import', () => {
  const point = (lat: number, lon: number, ele?: number) =>
    `<Trackpoint><Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lon}</LongitudeDegrees></Position>${ele === undefined ? '' : `<AltitudeMeters>${ele}</AltitudeMeters>`}</Trackpoint>`;
  const tcx = (body: string) =>
    `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">${body}</TrainingCenterDatabase>`;

  it('reads an activity: one segment per track, altitude, positionless points skipped', () => {
    const lap = (start: number) =>
      `<Lap><Track>${point(-22.9, -43.2 + start, 10)}<Trackpoint><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint>${point(-22.9, -43.19 + start, 20)}</Track></Lap>`;
    const imported = importTrackFile(
      text(
        tcx(
          `<Activities><Activity Sport="Biking"><Id>2026-01-01T00:00:00Z</Id>${lap(0)}${lap(0.02)}</Activity></Activities>`,
        ),
      ),
    );
    expect(imported.route.provider).toBe('Imported TCX');
    expect(imported.route.segments.map((s) => s.length)).toEqual([2, 2]);
    expect(imported.elevations).toEqual([
      [10, 20],
      [10, 20],
    ]);
    expect(imported.name).toBe('');
  });

  it('reads a course name and course points', () => {
    const imported = importTrackFile(
      text(
        tcx(
          `<Courses><Course><Name>Coast</Name><Track>${point(-22.9, -43.2)}${point(-22.9, -43.15)}${point(-22.9, -43.1)}</Track><CoursePoint><Name>Beach</Name><Position><LatitudeDegrees>-22.9</LatitudeDegrees><LongitudeDegrees>-43.15</LongitudeDegrees></Position></CoursePoint></Course></Courses>`,
        ),
      ),
    );
    expect(imported.name).toBe('Coast');
    expect(imported.points.map((p) => p.name)).toEqual([
      'Start',
      'Beach',
      'Destination',
    ]);
    expect(imported.elevations).toBeUndefined();
  });

  it('rejects invalid coordinates', () => {
    expect(() =>
      importTrackFile(
        text(
          tcx(
            `<Courses><Course><Track>${point(95, 0)}${point(0, 0)}</Track></Course></Courses>`,
          ),
        ),
      ),
    ).toThrow('The TCX contains invalid coordinates.');
  });
});

describe('format detection', () => {
  const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Trip</name><trkseg><trkpt lat="-22.9" lon="-43.2"/><trkpt lat="-22.9" lon="-43.1"/></trkseg></trk></gpx>`;

  it('detects GPX by content regardless of extension and matches importGpx', () => {
    expect(importTrackFile(text(gpx))).toEqual(importGpx(gpx));
  });

  it('unpacks gzip and ZIP exports and accepts TCX with leading spaces', () => {
    const plain = importTrackFile(text(gpx));
    expect(importTrackFile(gzipSync(text(gpx)))).toEqual(plain);
    expect(
      importTrackFile(
        zipSync({
          '__MACOSX/._trip.gpx': text('junk'),
          'notes.txt': text('hello'),
          'export/trip.gpx': text(gpx),
        }),
      ),
    ).toEqual(plain);
    expect(() => importTrackFile(zipSync({ 'a.txt': text('x') }))).toThrow(
      'This ZIP has no GPX, TCX or FIT file.',
    );
    expect(() => importTrackFile(gzipSync(new Uint8Array(10_000_001)))).toThrow(
      'Choose a file smaller than 10 MB.',
    );
    expect(() =>
      importTrackFile(zipSync({ 'big.fit': new Uint8Array(10_000_001) })),
    ).toThrow('Choose a file smaller than 10 MB.');
    const tcx = `   \n<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase><Courses><Course><Track><Trackpoint><Position><LatitudeDegrees>-22.9</LatitudeDegrees><LongitudeDegrees>-43.2</LongitudeDegrees></Position></Trackpoint><Trackpoint><Position><LatitudeDegrees>-22.9</LatitudeDegrees><LongitudeDegrees>-43.1</LongitudeDegrees></Position></Trackpoint></Track></Course></Courses></TrainingCenterDatabase>`;
    expect(importTrackFile(text(tcx)).route.provider).toBe('Imported TCX');
  });

  it('rejects other files', () => {
    expect(() => importTrackFile(text('<kml></kml>'))).toThrow(
      'This file is not a valid GPX, TCX or FIT file.',
    );
    expect(() => importTrackFile(new Uint8Array([0, 1, 2, 255]))).toThrow(
      'This file is not a valid GPX, TCX or FIT file.',
    );
    expect(() => importTrackFile(new Uint8Array(10_000_001))).toThrow(
      'Choose a file smaller than 10 MB.',
    );
  });

  it('recognizes imported provider labels', () => {
    expect(importedProvider('Imported FIT + OSRM')).toBe('Imported FIT');
    expect(importedProvider('Imported TCX')).toBe('Imported TCX');
    expect(importedProvider('Imported GPXX')).toBeNull();
    expect(importedProvider('OSRM')).toBeNull();
  });
});
