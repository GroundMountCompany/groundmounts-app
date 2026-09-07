/**
 * Identify an uploaded file from its actual bytes.
 *
 * The browser's declared content type is caller-controlled and proves nothing;
 * an endpoint that forwards whatever it is handed to a paid API on the strength
 * of a header is an endpoint somebody will feed something else.
 */

export type UploadKind = 'jpeg' | 'png' | 'pdf' | 'heic' | 'unknown';

export interface SniffedUpload {
  kind: UploadKind;
  /** What Anthropic should be told this is. Null when we will not send it. */
  mediaType: string | null;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PDF = Buffer.from('%PDF-');

/**
 * HEIC is an ISO-BMFF container: bytes 4..8 are "ftyp" and the brand follows.
 * iPhones photograph in it by default, so a customer photographing their bill
 * is the likeliest thing to arrive.
 */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1'];

export function sniffUpload(buffer: Buffer): SniffedUpload {
  if (buffer.subarray(0, PNG.length).equals(PNG)) {
    return { kind: 'png', mediaType: 'image/png' };
  }
  if (buffer.subarray(0, JPEG.length).equals(JPEG)) {
    return { kind: 'jpeg', mediaType: 'image/jpeg' };
  }
  if (buffer.subarray(0, PDF.length).equals(PDF)) {
    return { kind: 'pdf', mediaType: 'application/pdf' };
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1');
    if (HEIC_BRANDS.includes(brand)) {
      // Recognised and refused. Converting HEIC needs a native decoder this
      // app does not have, and guessing would send Anthropic bytes it cannot
      // read and charge the owner for the privilege. Naming it lets the client
      // say something a person can act on.
      return { kind: 'heic', mediaType: null };
    }
  }

  return { kind: 'unknown', mediaType: null };
}
