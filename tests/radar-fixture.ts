export const radarNow = new Date('2026-11-08T16:00:00Z');
export function radarMetadata() {
  return {
    host: 'https://tilecache.rainviewer.com',
    radar: {
      past: [-1200, -600, 0].map((offset, i) => ({
        time: radarNow.getTime() / 1000 + offset,
        path: `/v2/radar/frame${i}`,
      })),
    },
  };
}
export const radarPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgWPzgPwAErQKDXIPCvwAAAABJRU5ErkJggg==';
