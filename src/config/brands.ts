export type BrandConfig = {
  // Identity
  name: string;
  tagline: string;
  domain: string;
  logo: string;

  // Colors
  primaryColor: string;
  accentColor: string;

  // Contact
  phone: string;
  email: string;
  calendlyUrl: string;

  /**
   * The From address on the customer's quote email.
   *
   * Its domain has to be verified in Resend or the send fails outright, which
   * is why every brand here points at a domain the owner controls rather than
   * at whatever the funnel was embedded on.
   */
  fromEmail: string;
  /** Where a reply lands. A customer hitting reply is a customer talking. */
  replyTo: string;

  // Copy
  headline: string;
  subheadline: string;
  trustBadges: string[];

  // Social proof
  socialProofText: string;

  // Meta
  metaTitle: string;
  metaDescription: string;
};

export const brands: Record<string, BrandConfig> = {
  groundmounts: {
    name: "The Ground Mount Company",
    tagline: "Your Ground Mount Guys",
    domain: "groundmounts.com",
    logo: "/logos/groundmount-company.png",
    primaryColor: "#1e3a5f",
    accentColor: "#dc2626",
    phone: "(469) 809-7099",
    email: "info@groundmounts.com",
    fromEmail: "The Ground Mount Company <quotes@groundmounts.com>",
    replyTo: "info@groundmounts.com",
    calendlyUrl: "https://calendly.com/groundmounts/consultation",
    headline: "Design Your Ground Mount System",
    subheadline: "Skip the roof. Own your power.",
    trustBadges: ["Licensed Electrician", "25-Year Warranty", "100+ Installs", "No Roof Damage"],
    socialProofText: "Serving Texas homeowners since 2020",
    metaTitle: "Ground Mount Solar Design Tool | The Ground Mount Company",
    metaDescription: "Design your custom ground mount solar system in minutes. Get an instant quote for professional installation in Texas.",
  },



  /**
   * No branding at all, for partner funnels embedded on somebody else's site.
   *
   * The customer there has never heard of any of the four names above, so the
   * email says what it is and comes from the address that can actually answer
   * a reply.
   */
  neutral: {
    name: "Ground Mount Solar",
    tagline: "Ground mount solar design",
    // The one verified sending domain, worn under a neutral display name.
    domain: "groundmounts.com",
    logo: "/logos/groundmount-company.png",
    primaryColor: "#1e3a5f",
    accentColor: "#16a34a",
    phone: "(469) 809-7099",
    email: "info@groundmounts.com",
    fromEmail: "Ground Mount Solar <quotes@groundmounts.com>",
    replyTo: "info@groundmounts.com",
    calendlyUrl: "https://calendly.com/groundmounts/consultation",
    headline: "Design your ground mount system",
    subheadline: "Plan your installation and get a ballpark price",
    trustBadges: ["No Roof Damage", "Optimal Sun Angle", "25-Year Warranty", "Texas Local"],
    socialProofText: "Ground mount solar for Texas landowners",
    metaTitle: "Ground Mount Solar | Design Tool",
    metaDescription: "Design your ground mount solar system and get a ballpark price.",
  },
};

export type BrandKey = keyof typeof brands;

export const DEFAULT_BRAND: BrandKey = "groundmounts";

/**
 * The brand a funnel wears.
 *
 * Deliberately not derived from `?source=`. That parameter is attribution —
 * which partner site sent this visitor — and letting it pick a brand meant any
 * URL could choose what a customer's email claimed to be from. Attribution is
 * recorded in Airtable and changes nothing else.
 *
 * So: an explicit `?brand=`, or the build's NEXT_PUBLIC_BRAND, or the default.
 * Anything unrecognised is the default rather than an error, because a bad
 * query string is not a reason to stop somebody getting a quote.
 */
export function brandFor(requested?: string | null): BrandConfig {
  const wanted = requested?.trim().toLowerCase();
  if (wanted && wanted in brands) return brands[wanted];

  const configured = process.env.NEXT_PUBLIC_BRAND?.trim().toLowerCase();
  if (configured && configured in brands) return brands[configured];

  return brands[DEFAULT_BRAND];
}
