import type { Coord } from './core';

/**
 * Minimal FIT decoder for route import: course and activity positions,
 * altitude, course points and the course name. Every other message and field
 * (heart rate, power, timestamps, developer data) is skipped and never kept.
 * Input is untrusted: sizes are bounded and the file CRC is checked.
 */

export interface FitTrack {
  name: string;
  segments: Coord[][];
  /** Altitude per position, parallel to `segments`. */
  elevations: (number | null)[][];
  /** Course points with a position. */
  waypoints: { name: string; coord: Coord }[];
}

const MAX_POSITIONS = 200_000,
  /** Positions missing for a stretch longer than this start a new segment. */
  GAP_METERS = 1000,
  SEMICIRCLE = 180 / 2 ** 31;

const RECORD = 20,
  COURSE = 31,
  COURSE_POINT = 32;

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001,
  0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];
function crc(bytes: Uint8Array, start: number, end: number): number {
  let value = 0;
  for (let i = start; i < end; i++) {
    const byte = bytes[i];
    let tmp = CRC_TABLE[value & 0xf];
    value = ((value >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[byte & 0xf];
    tmp = CRC_TABLE[value & 0xf];
    value = ((value >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf];
  }
  return value;
}

/** True when the bytes start with a FIT file header. */
export function isFit(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    (bytes[0] === 12 || bytes[0] === 14) &&
    String.fromCharCode(...bytes.subarray(8, 12)) === '.FIT'
  );
}

interface Definition {
  global: number;
  little: boolean;
  fields: { num: number; size: number; type: number }[];
  /** Total size of the developer fields, which are skipped. */
  developer: number;
}

const invalid = 'This file is not a valid FIT.';

export function decodeFit(
  bytes: Uint8Array,
  meters: (a: Coord, b: Coord) => number,
): FitTrack {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  const track: FitTrack = {
    name: '',
    segments: [],
    elevations: [],
    waypoints: [],
  };
  let positions = 0,
    missing = false,
    last: Coord | null = null;

  const addPosition = (coord: Coord, ele: number | null) => {
    if (++positions > MAX_POSITIONS)
      throw new Error('This file has too many track points.');
    if (!last || (missing && meters(last, coord) > GAP_METERS)) {
      track.segments.push([]);
      track.elevations.push([]);
    }
    track.segments.at(-1)!.push(coord);
    track.elevations.at(-1)!.push(ele);
    last = coord;
    missing = false;
  };

  let offset = 0;
  // A file may chain several FIT files one after another.
  while (offset < bytes.length) {
    if (!isFit(bytes.subarray(offset))) {
      if (offset === 0) throw new Error(invalid);
      break;
    }
    const headerSize = bytes[offset];
    const dataSize = view.getUint32(offset + 4, true);
    const start = offset + headerSize,
      end = start + dataSize;
    if (end + 2 > bytes.length) throw new Error('This FIT file is truncated.');
    if (crc(bytes, offset, end) !== view.getUint16(end, true))
      throw new Error('This FIT file is damaged (checksum mismatch).');

    const definitions = new Map<number, Definition>();
    let at = start;
    const need = (n: number) => {
      if (at + n > end) throw new Error('This FIT file is truncated.');
    };
    while (at < end) {
      const header = bytes[at++];
      let local: number;
      if (header & 0x80) local = (header >> 5) & 0x3;
      else {
        local = header & 0x0f;
        if (header & 0x40) {
          // Definition message.
          need(5);
          const little = bytes[at + 1] === 0;
          const global = view.getUint16(at + 2, little);
          const count = bytes[at + 4];
          at += 5;
          need(count * 3);
          const fields = [];
          for (let i = 0; i < count; i++, at += 3)
            fields.push({
              num: bytes[at],
              size: bytes[at + 1],
              type: bytes[at + 2] & 0x1f,
            });
          let developer = 0;
          if (header & 0x20) {
            need(1);
            const devCount = bytes[at++];
            need(devCount * 3);
            for (let i = 0; i < devCount; i++, at += 3)
              developer += bytes[at + 1];
          }
          definitions.set(local, { global, little, fields, developer });
          continue;
        }
      }
      const definition = definitions.get(local);
      if (!definition) throw new Error(invalid);
      const values = new Map<number, number | string>();
      for (const field of definition.fields) {
        need(field.size);
        const value = readField(
          view,
          text,
          bytes,
          at,
          field,
          definition.little,
        );
        if (value !== null) values.set(field.num, value);
        at += field.size;
      }
      need(definition.developer);
      at += definition.developer;

      if (definition.global === RECORD) {
        const coord = position(values.get(0), values.get(1));
        if (!coord) {
          if (last) missing = true;
          continue;
        }
        const raw = values.get(78) ?? values.get(2);
        const ele = typeof raw === 'number' ? raw / 5 - 500 : null;
        addPosition(
          coord,
          ele !== null && ele > -500 && ele < 9000 ? ele : null,
        );
      } else if (definition.global === COURSE_POINT) {
        const coord = position(values.get(2), values.get(3));
        const name = values.get(6);
        if (coord)
          track.waypoints.push({
            name: (typeof name === 'string' && name.trim()) || 'Stop',
            coord,
          });
      } else if (definition.global === COURSE && !track.name) {
        const name = values.get(5);
        if (typeof name === 'string') track.name = name.trim();
      }
    }
    offset = end + 2;
  }
  return track;
}

function position(lat: unknown, lon: unknown): Coord | null {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const coord: Coord = [lat * SEMICIRCLE, lon * SEMICIRCLE];
  return Math.abs(coord[0]) <= 90 && Math.abs(coord[1]) <= 180 ? coord : null;
}

/** One field value, or null when it is invalid or of a type not needed here. */
function readField(
  view: DataView,
  text: TextDecoder,
  bytes: Uint8Array,
  at: number,
  field: { size: number; type: number },
  little: boolean,
): number | string | null {
  switch (field.type) {
    case 0x07: {
      // Null-terminated UTF-8 string.
      const raw = bytes.subarray(at, at + field.size);
      const zero = raw.indexOf(0);
      const value = text.decode(zero < 0 ? raw : raw.subarray(0, zero));
      return value ? value.slice(0, 240) : null;
    }
    case 0x04: // uint16
      if (field.size !== 2) return null;
      return nonInvalid(view.getUint16(at, little), 0xffff);
    case 0x05: // sint32
      if (field.size !== 4) return null;
      return nonInvalid(view.getInt32(at, little), 0x7fffffff);
    case 0x06: // uint32
      if (field.size !== 4) return null;
      return nonInvalid(view.getUint32(at, little), 0xffffffff);
    default:
      return null;
  }
}

const nonInvalid = (value: number, sentinel: number) =>
  value === sentinel ? null : value;
