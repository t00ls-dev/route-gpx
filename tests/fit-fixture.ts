/** Minimal FIT encoder for test fixtures, independent of the decoder. */

const CRC = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001,
  0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];
const crc = (bytes: number[]) =>
  bytes.reduce((c, b) => {
    let t = CRC[c & 0xf];
    c = ((c >> 4) & 0x0fff) ^ t ^ CRC[b & 0xf];
    t = CRC[c & 0xf];
    return ((c >> 4) & 0x0fff) ^ t ^ CRC[(b >> 4) & 0xf];
  }, 0);
export const le = (value: number, size: number) =>
  Array.from({ length: size }, (_, i) => (value >>> (8 * i)) & 0xff);
export const be = (value: number, size: number) => le(value, size).reverse();
export const semi = (deg: number) => Math.round((deg * 2 ** 31) / 180);

export type Field = [num: number, size: number, type: number];
export class Fit {
  bytes: number[] = [];
  define(
    local: number,
    global: number,
    fields: Field[],
    big = false,
    developer: number[] = [],
  ) {
    this.bytes.push(
      0x40 | (developer.length ? 0x20 : 0) | local,
      0,
      big ? 1 : 0,
      ...(big ? be(global, 2) : le(global, 2)),
      fields.length,
      ...fields.flat(),
    );
    if (developer.length)
      this.bytes.push(
        developer.length,
        ...developer.flatMap((size, i) => [i, size, 0]),
      );
    return this;
  }
  data(header: number, ...values: number[][]) {
    this.bytes.push(header, ...values.flat());
    return this;
  }
  record(lat: number | null, lon: number | null, ele?: number) {
    return this.data(
      0,
      le(lat === null ? 0x7fffffff : semi(lat), 4),
      le(lon === null ? 0x7fffffff : semi(lon), 4),
      le(ele === undefined ? 0xffff : Math.round((ele + 500) * 5), 2),
    );
  }
  file(): Uint8Array {
    const header = [
      14,
      0x20,
      ...le(2195, 2),
      ...le(this.bytes.length, 4),
      ...'.FIT'.split('').map((c) => c.charCodeAt(0)),
    ];
    header.push(...le(crc(header), 2));
    const all = [...header, ...this.bytes];
    return new Uint8Array([...all, ...le(crc(all), 2)]);
  }
}
export const recordFields: Field[] = [
  [0, 4, 0x85],
  [1, 4, 0x85],
  [2, 2, 0x84],
];
export const name = (text: string, size = 16) => {
  const bytes = [...new TextEncoder().encode(text)];
  return [...bytes, ...Array(size - bytes.length).fill(0)];
};
