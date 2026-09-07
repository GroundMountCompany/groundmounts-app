/** PNG signature: \x89 P N G \r \n \x1a \n */
export const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** JPEG SOI marker plus the first byte of the next marker. */
export const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export interface SniffedImage {
  ext: 'png' | 'jpg';
  contentType: string;
}

/**
 * Identify an image from its actual bytes.
 *
 * The `data:` prefix on an uploaded screenshot is caller-controlled and proves
 * nothing, so the format is decided by the signature and the Blob content type
 * follows from that.
 *
 * Lives here rather than in the route because Next.js route modules may only
 * export their handlers.
 */
export function sniffImage(buffer: Buffer): SniffedImage | null {
  if (buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  return null;
}
