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

  texasgroundmountsolar: {
    name: "Texas Ground Mount Solar",
    tagline: "Ground Mount Solar for Texas Properties",
    domain: "texasgroundmountsolar.com",
    logo: "/logos/texas-ground-mount.png",
    primaryColor: "#14532d",
    accentColor: "#ca8a04",
    phone: "(469) 809-7099",
    email: "info@texasgroundmountsolar.com",
    fromEmail: "Texas Ground Mount Solar <quotes@texasgroundmountsolar.com>",
    replyTo: "info@texasgroundmountsolar.com",
    calendlyUrl: "https://calendly.com/groundmounts/consultation",
    headline: "Texas Ground Mount Solar Installers",
    subheadline: "Professional ground mount installation across DFW and Houston",
    trustBadges: ["Texas-Based", "25-Year Warranty", "500+ Projects", "Free Site Visit"],
    socialProofText: "Texas's trusted ground mount specialists",
    metaTitle: "Texas Ground Mount Solar | Professional Installation",
    metaDescription: "Professional ground mount solar installation across Texas. Design your system and get an instant quote.",
  },

  backyardsolartexas: {
    name: "Backyard Solar Texas",
    tagline: "Solar for Texas Land Owners",
    domain: "backyardsolartexas.com",
    logo: "/logos/backyard-solar.png",
    primaryColor: "#166534",
    accentColor: "#eab308",
    phone: "(469) 809-7099",
    email: "info@backyardsolartexas.com",
    fromEmail: "Backyard Solar Texas <quotes@backyardsolartexas.com>",
    replyTo: "info@backyardsolartexas.com",
    calendlyUrl: "https://calendly.com/groundmounts/consultation",
    headline: "Got Land? Skip the Roof.",
    subheadline: "Ground mount solar for Texas properties with space",
    trustBadges: ["No Roof Damage", "Optimal Sun Angle", "25-Year Warranty", "Texas Local"],
    socialProofText: "Helping Texas landowners go solar",
    metaTitle: "Backyard Solar Texas | Ground Mount Solar for Land Owners",
    metaDescription: "Have land? Skip the roof and install ground mount solar. Design your system for your Texas property.",
  },

  groundmountsolarguide: {
    name: "Ground Mount Solar Guide",
    tagline: "Your Complete Ground Mount Resource",
    domain: "groundmountsolar.guide",
    logo: "/logos/solar-guide.png",
    primaryColor: "#0369a1",
    accentColor: "#16a34a",
    phone: "(469) 809-7099",
    email: "info@groundmountsolar.guide",
    fromEmail: "Ground Mount Solar Guide <quotes@groundmountsolar.guide>",
    replyTo: "info@groundmountsolar.guide",
    calendlyUrl: "https://calendly.com/groundmounts/consultation",
    headline: "Design Your Ground Mount System",
    subheadline: "Free tool to plan your ground mount solar installation",
    trustBadges: ["Free Design Tool", "Instant Quote", "No Obligation", "Expert Support"],
    socialProofText: "Trusted by thousands of homeowners",
    metaTitle: "Ground Mount Solar Guide | Free Design Tool",
    metaDescription: "Free ground mount solar design tool. Plan your installation and get expert guidance.",
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
 * The brand for a funnel, from its ?source= domain or the build's default.
 *
 * Server-side too: the quote email has to be sent as the brand the customer
 * filled the form in on, and the route only knows what the payload's `source`
 * says.
 */
export function brandForSource(source?: string | null): BrandConfig {
  if (source) {
    const wanted = source.trim().toLowerCase();
    const match = Object.values(brands).find(
      (b) => b.domain.toLowerCase() === wanted || wanted.includes(b.domain.toLowerCase())
    );
    if (match) return match;
    if (wanted === 'neutral' || wanted === 'partner') return brands.neutral;
  }
  const configured = process.env.NEXT_PUBLIC_BRAND as BrandKey | undefined;
  return brands[configured ?? DEFAULT_BRAND] ?? brands[DEFAULT_BRAND];
}
