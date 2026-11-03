export function shareFile(
  xml: string,
  name: string,
  canShare: (data: ShareData) => boolean,
): File | null {
  for (const type of [
    'application/gpx+xml',
    'application/xml',
    'text/xml',
    'application/octet-stream',
    'text/plain',
  ]) {
    const file = new File([xml], name, { type });
    try {
      if (canShare({ files: [file] })) return file;
    } catch {
      /* Try the next supported MIME type. */
    }
  }
  return null;
}
