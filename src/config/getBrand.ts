import { brands, brandFor, BrandConfig, BrandKey, DEFAULT_BRAND } from './brands';

/**
 * The brand for this build, or the one a `?brand=` asked for.
 *
 * Delegates to `brandFor` so the page, the quote email and the tests all
 * resolve a brand the same way. `?source=` is attribution and never reaches
 * this.
 */
export function getBrand(requested?: string | null): BrandConfig {
  return brandFor(requested);
}

/**
 * Get the current brand key.
 */
export function getBrandKey(): BrandKey {
  const brandKey = (process.env.NEXT_PUBLIC_BRAND || DEFAULT_BRAND) as BrandKey;
  return brandKey in brands ? brandKey : DEFAULT_BRAND;
}
