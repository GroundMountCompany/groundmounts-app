import { brands, BrandConfig, BrandKey, DEFAULT_BRAND } from './brands';

/**
 * Get the current brand configuration based on NEXT_PUBLIC_BRAND env var.
 * Falls back to the default brand if not set or invalid.
 */
export function getBrand(): BrandConfig {
  const brandKey = (process.env.NEXT_PUBLIC_BRAND || DEFAULT_BRAND) as BrandKey;

  if (brandKey in brands) {
    return brands[brandKey];
  }

  console.warn(`Unknown brand "${brandKey}", falling back to "${DEFAULT_BRAND}"`);
  return brands[DEFAULT_BRAND];
}

/**
 * Get the current brand key.
 */
export function getBrandKey(): BrandKey {
  const brandKey = (process.env.NEXT_PUBLIC_BRAND || DEFAULT_BRAND) as BrandKey;
  return brandKey in brands ? brandKey : DEFAULT_BRAND;
}
