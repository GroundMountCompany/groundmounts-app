import { describe, it, expect } from 'vitest';
import { sniffImage } from './imageSniff';

const png = (extra: number[] = []) =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...extra]);
const jpeg = (extra: number[] = []) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...extra]);

describe('screenshot format sniffing', () => {
  it('identifies a PNG from its signature', () => {
    expect(sniffImage(png())).toEqual({ ext: 'png', contentType: 'image/png' });
  });

  it('identifies a JPEG from its SOI marker', () => {
    // The capture path now stores JPEG so it fits in persisted state.
    expect(sniffImage(jpeg())).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });

  it('rejects anything else, whatever the data: prefix claimed', () => {
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImage(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(sniffImage(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it('rejects a near-miss PNG signature', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  });

  it('rejects a truncated JPEG marker', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
