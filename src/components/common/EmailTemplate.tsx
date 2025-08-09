import * as React from "react";

// ===== Types =====
type LatLng = { lat: number; lng: number } | string;

export type QuoteEmailProps = {
  brandName?: string;
  logoUrl?: string;             // header logo (optional)
  designImageUrl?: string;      // right-side "design" image (optional)
  homeImageUrl?: string;        // left-side "site/home" image (optional)
  calendlyUrl?: string;         // booking link
  supportEmail?: string;        // footer contact

  previewText?: string;         // inbox preview copy

  // Core quote values (keep names you already pass; add safe fallbacks)
  client?: string;
  systemType?: string;
  address?: string;
  materials?: string;
  coordinates?: LatLng | string;
  trenching?: string;
  estimatedCost?: string;        // subtotal before credit
  fedralTax?: string;
  totalCost?: string;            // net total
  date?: string;                 // e.g., 'Aug 09, 2025'
  installationTimeline?: string; // e.g., '3–4 weeks'
  proTips?: string[];           // list; optional
};

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: "#f6f7f9",
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Helvetica Neue",Arial,sans-serif',
    color: "#111827",
  } as React.CSSProperties,
  container: {
    width: "100%",
    tableLayout: "fixed",
    backgroundColor: "#f6f7f9",
    padding: "24px 0",
  } as React.CSSProperties,
  card: {
    width: "100%",
    maxWidth: "720px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
  } as React.CSSProperties,
  header: {
    padding: "20px 24px",
    borderBottom: "1px solid #e5e7eb",
  } as React.CSSProperties,
  h1: { margin: 0, fontSize: "20px", lineHeight: "28px", fontWeight: 800 } as React.CSSProperties,
  sub: { marginTop: "6px", fontSize: "14px", color: "#6b7280" } as React.CSSProperties,
  section: { padding: "20px 24px" } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } as React.CSSProperties,
  label: { fontSize: "12px", color: "#6b7280", letterSpacing: ".02em" } as React.CSSProperties,
  value: { fontSize: "15px", fontWeight: 600, color: "#111827" } as React.CSSProperties,
  costRow: { fontSize: "14px", color: "#111827" } as React.CSSProperties,
  muted: { color: "#6b7280" } as React.CSSProperties,
  kbd: {
    display: "inline-block",
    background: "#e5e7eb",
    borderRadius: "6px",
    padding: "2px 6px",
    fontSize: "12px",
    fontWeight: 700,
  } as React.CSSProperties,
  ctaWrap: { padding: "8px 24px 24px" } as React.CSSProperties,
  cta: {
    display: "inline-block",
    backgroundColor: "#111827",
    color: "#ffffff",
    padding: "14px 32px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "15px",
    fontWeight: 700,
    textAlign: "center" as const,
  } as React.CSSProperties,
  imgBox: {
    width: "100%",
    height: "180px",
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  } as React.CSSProperties,
  footer: {
    padding: "20px 24px",
    borderTop: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    borderBottomLeftRadius: "16px",
    borderBottomRightRadius: "16px",
  } as React.CSSProperties,
};

export default function EmailTemplate({
  brandName = "The Ground Mount Company",
  logoUrl,
  designImageUrl,
  homeImageUrl,
  calendlyUrl = "#",
  supportEmail = "info@groundmounts.com",
  previewText = "Your custom ground mount solar quote is ready",
  
  // Quote data
  client = "Homeowner",
  systemType = "Ground Mount Solar System",
  address = "Your Property",
  materials = "Premium-quality components",
  coordinates,
  trenching,
  estimatedCost = "$0",
  fedralTax,
  totalCost = "$0",
  date = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
  installationTimeline = "3-4 weeks",
  proTips = [
    "Maximize sun exposure by keeping panels free from shade",
    "Consider seasonal sun angles when positioning your system",
    "Regular cleaning maintains optimal efficiency"
  ],
}: QuoteEmailProps): React.JSX.Element {
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL || "https://ground-mounts-web.vercel.app";
  
  // Format coordinates
  const coordsDisplay = typeof coordinates === 'string' 
    ? coordinates 
    : coordinates && typeof coordinates === 'object' && 'lat' in coordinates
    ? `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`
    : "—";

  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>{previewText}</title>
      </head>
      <body style={styles.body}>
        {/* Preview text for inbox */}
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden" }}>
          {previewText}
        </div>
        
        {/* Main container */}
        <table role="presentation" style={styles.container}>
          <tr>
            <td align="center">
              <table role="presentation" style={styles.card}>
                {/* Header */}
                <tr>
                  <td style={styles.header}>
                    <table style={styles.table}>
                      <tr>
                        <td>
                          <h1 style={styles.h1}>Your Solar Quote is Ready! ☀️</h1>
                          <p style={styles.sub}>
                            Dear {client}, your custom ground mount design is complete
                          </p>
                        </td>
                        {logoUrl && (
                          <td align="right" width="120">
                            <img 
                              src={logoUrl || `${baseUrl}/images/logo-email.png`}
                              alt={brandName}
                              width="100"
                              style={{ display: "block", maxWidth: "100px" }}
                            />
                          </td>
                        )}
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* Images Section */}
                <tr>
                  <td style={{ padding: "0 24px" }}>
                    <table style={styles.table}>
                      <tr>
                        <td width="48%" style={{ paddingRight: "8px" }}>
                          <div style={styles.imgBox}>
                            {homeImageUrl ? (
                              <img 
                                src={homeImageUrl || `${baseUrl}/images/email-left.png`}
                                alt="Your home site"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{ padding: "60px 20px", textAlign: "center", color: "#9ca3af" }}>
                                <div style={{ fontSize: "32px" }}>🏠</div>
                                <div style={{ fontSize: "12px", marginTop: "8px" }}>Site Image</div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td width="48%" style={{ paddingLeft: "8px" }}>
                          <div style={styles.imgBox}>
                            {designImageUrl ? (
                              <img 
                                src={designImageUrl || `${baseUrl}/images/email-right.png`}
                                alt="Your solar design"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{ padding: "60px 20px", textAlign: "center", color: "#9ca3af" }}>
                                <div style={{ fontSize: "32px" }}>⚡</div>
                                <div style={{ fontSize: "12px", marginTop: "8px" }}>Design Preview</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* Quote Details */}
                <tr>
                  <td style={styles.section}>
                    <table style={styles.table}>
                      <tr>
                        <td colSpan={2} style={{ paddingBottom: "16px" }}>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                            Quote Details
                          </div>
                        </td>
                      </tr>
                      
                      {/* System Info */}
                      <tr>
                        <td style={{ padding: "8px 0" }}>
                          <div style={styles.label}>SYSTEM TYPE</div>
                          <div style={styles.value}>{systemType}</div>
                        </td>
                        <td style={{ padding: "8px 0" }}>
                          <div style={styles.label}>INSTALLATION</div>
                          <div style={styles.value}>{installationTimeline}</div>
                        </td>
                      </tr>
                      
                      <tr>
                        <td colSpan={2} style={{ padding: "8px 0" }}>
                          <div style={styles.label}>PROPERTY ADDRESS</div>
                          <div style={styles.value}>{address}</div>
                        </td>
                      </tr>
                      
                      <tr>
                        <td style={{ padding: "8px 0" }}>
                          <div style={styles.label}>COORDINATES</div>
                          <div style={styles.value}>{coordsDisplay}</div>
                        </td>
                        <td style={{ padding: "8px 0" }}>
                          <div style={styles.label}>MATERIALS</div>
                          <div style={styles.value}>{materials}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* Cost Breakdown */}
                <tr>
                  <td style={{ padding: "0 24px 20px" }}>
                    <div style={{
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      padding: "16px",
                      border: "1px solid #e5e7eb"
                    }}>
                      <table style={styles.table}>
                        <tr>
                          <td colSpan={2} style={{ paddingBottom: "12px" }}>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                              Cost Breakdown
                            </div>
                          </td>
                        </tr>
                        
                        <tr>
                          <td style={styles.costRow}>System Cost</td>
                          <td align="right" style={{ ...styles.costRow, fontWeight: 600 }}>
                            {estimatedCost}
                          </td>
                        </tr>
                        
                        {trenching && (
                          <tr>
                            <td style={{ ...styles.costRow, paddingTop: "6px" }}>Trenching</td>
                            <td align="right" style={{ ...styles.costRow, paddingTop: "6px", fontWeight: 600 }}>
                              {trenching}
                            </td>
                          </tr>
                        )}
                        
                        {fedralTax && (
                          <tr>
                            <td style={{ ...styles.costRow, paddingTop: "6px", color: "#059669" }}>
                              Federal Tax Credit (30%)
                            </td>
                            <td align="right" style={{ ...styles.costRow, paddingTop: "6px", color: "#059669", fontWeight: 600 }}>
                              -${fedralTax}
                            </td>
                          </tr>
                        )}
                        
                        <tr>
                          <td colSpan={2} style={{ paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
                            <table style={styles.table}>
                              <tr>
                                <td style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                                  Total Investment
                                </td>
                                <td align="right" style={{ fontSize: "20px", fontWeight: 800, color: "#111827" }}>
                                  {totalCost}
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        
                        <tr>
                          <td colSpan={2} style={{ paddingTop: "8px" }}>
                            <div style={{ fontSize: "11px", color: "#6b7280" }}>
                              Quote generated on {date}
                            </div>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                {/* Pro Tips */}
                {proTips && proTips.length > 0 && (
                  <tr>
                    <td style={{ padding: "0 24px 20px" }}>
                      <div style={{
                        backgroundColor: "#fef3c7",
                        borderRadius: "8px",
                        padding: "16px",
                        border: "1px solid #fde68a"
                      }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#92400e", marginBottom: "8px" }}>
                          💡 Pro Tips
                        </div>
                        <ul style={{ margin: 0, paddingLeft: "20px", color: "#78350f", fontSize: "13px", lineHeight: "20px" }}>
                          {proTips.map((tip, i) => (
                            <li key={i} style={{ marginBottom: i < proTips.length - 1 ? "4px" : 0 }}>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </td>
                  </tr>
                )}

                {/* CTA */}
                <tr>
                  <td style={styles.ctaWrap}>
                    <table style={styles.table}>
                      <tr>
                        <td align="center">
                          <a href={calendlyUrl} style={styles.cta}>
                            📞 Book Your Free Consultation
                          </a>
                          <div style={{ marginTop: "12px", fontSize: "13px", color: "#6b7280" }}>
                            Takes 30 seconds • No obligation • Expert guidance
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* Footer */}
                <tr>
                  <td style={styles.footer}>
                    <table style={styles.table}>
                      <tr>
                        <td>
                          <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "18px" }}>
                            Questions? Email us at{" "}
                            <a href={`mailto:${supportEmail}`} style={{ color: "#111827", fontWeight: 600 }}>
                              {supportEmail}
                            </a>
                          </div>
                          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "8px" }}>
                            © 2024 {brandName}. Empowering homes with clean energy.
                          </div>
                        </td>
                        <td align="right">
                          <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                            <a href="https://www.youtube.com/channel/UCfvcBjN1jER6Wer4vPAjvhA" style={{ color: "#6b7280", textDecoration: "none", marginRight: "12px" }}>
                              Youtube
                            </a>
                            <a href="https://www.facebook.com/profile.php?id=61572574884731" style={{ color: "#6b7280", textDecoration: "none" }}>
                              Facebook
                            </a>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  );
}