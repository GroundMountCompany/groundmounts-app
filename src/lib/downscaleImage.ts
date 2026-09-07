/**
 * Shrink a photo before it is uploaded.
 *
 * A modern phone camera produces 8–12 MB images, and Vercel rejects a request
 * body over 4.5 MB before any of our code runs — so the customer would have
 * seen a platform error page rather than the "type it in instead" this funnel
 * promises. Downscaling in the browser makes the upload smaller than the limit
 * instead of apologising for being over it.
 *
 * 2000px on the long edge is far more than the model needs to read a printed
 * table, and JPEG at 0.85 keeps small text crisp. A 12 MP photo comes out
 * around 400–800 KB.
 *
 * PDFs are passed through untouched: a browser cannot re-render one, and a bill
 * exported as a PDF is small anyway.
 */

export const MAX_EDGE_PX = 2000;
export const JPEG_QUALITY = 0.85;

/** Only images can be resized; anything else is returned as it arrived. */
function isResizableImage(file: File): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png';
}

export async function downscaleImage(
  file: File,
  maxEdge = MAX_EDGE_PX,
  quality = JPEG_QUALITY
): Promise<File> {
  if (!isResizableImage(file)) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);

    // Already small enough, and re-encoding would only lose detail.
    if (longest <= maxEdge && file.size <= 2 * 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const scale = Math.min(1, maxEdge / longest);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) return file;

    // If the round trip somehow made it bigger, keep the original.
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    // A photo we cannot decode is one the server will reject with a message
    // the customer can act on. Better that than failing silently here.
    return file;
  }
}
