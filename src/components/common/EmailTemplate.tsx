import * as React from "react";

// ===== Types =====
type LatLng = { lat: number; lng: number } | string;

export type QuoteEmailProps = {
  brandName?: string;
  logoUrl?: string;
  designImageUrl?: string;
  homeImageUrl?: string;
  calendlyUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  previewText?: string;

  // Core quote values
  client?: string;
  systemType?: string;
  address?: string;
  materials?: string;
  coordinates?: LatLng | string;
  trenching?: string;
  trenchingDistance?: number;
  estimatedCost?: string;
  systemCostRaw?: number;
  trenchingCostRaw?: number;
  totalCost?: string;
  totalCostRaw?: number;
  totalPanels?: number;
  systemSizeKw?: number;
  monthlyBill?: number;
  offsetPercentage?: number;
  date?: string;
  installationTimeline?: string;
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
    maxWidth: "640px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
  } as React.CSSProperties,
  header: {
    padding: "32px 24px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: "16px",
    borderTopRightRadius: "16px",
    textAlign: "center" as const,
  } as React.CSSProperties,
  h1: { margin: 0, fontSize: "26px", lineHeight: "34px", fontWeight: 800, color: "#ffffff" } as React.CSSProperties,
  section: { padding: "24px" } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } as React.CSSProperties,
  label: { fontSize: "11px", color: "#6b7280", letterSpacing: ".04em", textTransform: "uppercase" as const } as React.CSSProperties,
  value: { fontSize: "15px", fontWeight: 600, color: "#111827" } as React.CSSProperties,
  costRow: { fontSize: "14px", color: "#111827", padding: "8px 0" } as React.CSSProperties,
  ctaWrap: { padding: "8px 24px 24px" } as React.CSSProperties,
  cta: {
    display: "block",
    backgroundColor: "#16a34a",
    color: "#ffffff",
    padding: "16px 32px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "16px",
    fontWeight: 700,
    textAlign: "center" as const,
  } as React.CSSProperties,
  ctaSecondary: {
    display: "block",
    backgroundColor: "#f3f4f6",
    color: "#111827",
    padding: "14px 32px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "15px",
    fontWeight: 600,
    textAlign: "center" as const,
    marginTop: "12px",
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
  brandName = "Ground Mount Solutions",
  supportEmail = "info@groundmounts.com",
  supportPhone = "(469) 809-7099",
  previewText,
  calendlyUrl = "https://calendly.com/groundmounts/consultation",

  // Quote data
  // client is kept for future personalization but currently unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  client = "Homeowner",
  address = "Your Property",
  systemCostRaw = 0,
  trenchingCostRaw = 0,
  trenchingDistance = 0,
  totalCostRaw = 0,
  totalPanels = 0,
  systemSizeKw = 0,
  date = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
  installationTimeline = "2-3 weeks",
}: QuoteEmailProps): React.JSX.Element {

  // Calculate key metrics
  const annualProductionKwh = Math.round(systemSizeKw * 1500); // Texas average: ~1,500 kWh per kW per year
  const systemLifespan = 25;
  const costPerYear = Math.round(totalCostRaw / systemLifespan);

  const formatCurrency = (n: number) => `$${n.toLocaleString()}`;

  const emailPreview = previewText || `Your ${systemSizeKw.toFixed(1)} kW energy independence system is ready`;

  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>{emailPreview}</title>
      </head>
      <body style={styles.body}>
        {/* Preview text for inbox */}
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden" }}>
          {emailPreview}
        </div>

        {/* Main container */}
        <table role="presentation" style={styles.container}>
          <tr>
            <td align="center">
              <table role="presentation" style={styles.card}>
                {/* Hero Header - Independence Focused */}
                <tr>
                  <td style={styles.header}>
                    <div style={{ fontSize: "13px", color: "#9ca3af", letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: "8px" }}>
                      Your Property • {address}
                    </div>
                    <h1 style={styles.h1}>Your Energy Independence Blueprint</h1>
                    <div style={{
                      marginTop: "16px",
                      fontSize: "42px",
                      fontWeight: 800,
                      color: "#ffffff",
                      letterSpacing: "-0.02em"
                    }}>
                      {systemSizeKw.toFixed(1)} kW
                    </div>
                    <div style={{ fontSize: "14px", color: "#9ca3af", marginTop: "4px" }}>
                      Personal Power Station
                    </div>
                  </td>
                </tr>

                {/* System Specs - Key Metrics */}
                <tr>
                  <td style={{ padding: "24px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: "16px" }}>
                      Your System Specifications
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tr>
                        <td style={{
                          padding: "16px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "8px",
                          textAlign: "center" as const,
                          width: "50%"
                        }}>
                          <div style={{ fontSize: "28px", fontWeight: 700, color: "#111827" }}>{totalPanels}</div>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>Solar Panels</div>
                        </td>
                        <td style={{ width: "12px" }}></td>
                        <td style={{
                          padding: "16px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "8px",
                          textAlign: "center" as const,
                          width: "50%"
                        }}>
                          <div style={{ fontSize: "28px", fontWeight: 700, color: "#111827" }}>{systemSizeKw.toFixed(1)} kW</div>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>System Size</div>
                        </td>
                      </tr>
                      <tr><td colSpan={3} style={{ height: "12px" }}></td></tr>
                      <tr>
                        <td style={{
                          padding: "16px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "8px",
                          textAlign: "center" as const,
                          width: "50%"
                        }}>
                          <div style={{ fontSize: "28px", fontWeight: 700, color: "#111827" }}>{annualProductionKwh.toLocaleString()}</div>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>Est. kWh/Year</div>
                        </td>
                        <td style={{ width: "12px" }}></td>
                        <td style={{
                          padding: "16px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "8px",
                          textAlign: "center" as const,
                          width: "50%"
                        }}>
                          <div style={{ fontSize: "28px", fontWeight: 700, color: "#111827" }}>25-30</div>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>Year Lifespan</div>
                        </td>
                      </tr>
                    </table>

                    {/* Trenching scope if applicable */}
                    {trenchingDistance > 0 && (
                      <div style={{
                        marginTop: "16px",
                        padding: "12px 16px",
                        backgroundColor: "#fef3c7",
                        borderRadius: "8px",
                        fontSize: "14px",
                        color: "#92400e"
                      }}>
                        <strong>Installation scope:</strong> {trenchingDistance} ft trenching from panels to meter
                      </div>
                    )}
                  </td>
                </tr>

                {/* Investment Section */}
                <tr>
                  <td style={{ padding: "0 24px 24px" }}>
                    <div style={{
                      backgroundColor: "#1a1a2e",
                      borderRadius: "12px",
                      padding: "24px",
                      textAlign: "center" as const,
                    }}>
                      <div style={{ fontSize: "12px", color: "#9ca3af", letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
                        Your Total Investment
                      </div>
                      <div style={{ fontSize: "48px", fontWeight: 800, color: "#ffffff", margin: "8px 0" }}>
                        {formatCurrency(totalCostRaw)}
                      </div>
                      <div style={{ fontSize: "14px", color: "#9ca3af", marginBottom: "16px" }}>
                        Complete turnkey installation
                      </div>

                      {/* Cost breakdown */}
                      <table style={{ width: "100%", marginTop: "16px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "16px" }}>
                        <tr>
                          <td style={{ fontSize: "14px", color: "#9ca3af", padding: "8px 0", textAlign: "left" as const }}>
                            System ({totalPanels} panels × 435W)
                          </td>
                          <td style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600, textAlign: "right" as const }}>
                            {formatCurrency(systemCostRaw)}
                          </td>
                        </tr>
                        {trenchingCostRaw > 0 && (
                          <tr>
                            <td style={{ fontSize: "14px", color: "#9ca3af", padding: "8px 0", textAlign: "left" as const }}>
                              Trenching ({trenchingDistance} ft)
                            </td>
                            <td style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600, textAlign: "right" as const }}>
                              {formatCurrency(trenchingCostRaw)}
                            </td>
                          </tr>
                        )}
                      </table>

                      {/* Cost per year */}
                      <div style={{
                        marginTop: "20px",
                        padding: "16px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderRadius: "8px"
                      }}>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: "#22c55e" }}>
                          {formatCurrency(costPerYear)}/year
                        </div>
                        <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "4px" }}>
                          Cost per year of ownership (over 25 years)
                        </div>
                      </div>

                      {/* Ownership statement */}
                      <div style={{
                        marginTop: "16px",
                        fontSize: "14px",
                        color: "#ffffff",
                        fontWeight: 500
                      }}>
                        You own this system outright — no leases, no monthly payments to a solar company.
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Why Ground Mount */}
                <tr>
                  <td style={{ padding: "0 24px 24px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px", color: "#111827" }}>
                      Why Ground Mount?
                    </div>
                    <table style={{ width: "100%" }}>
                      <tr>
                        <td style={{ fontSize: "14px", color: "#374151", padding: "8px 0", verticalAlign: "top" }}>
                          <span style={{ color: "#16a34a", marginRight: "10px", fontWeight: 700 }}>✓</span>
                          <strong>No roof penetrations or damage</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: "14px", color: "#374151", padding: "8px 0", verticalAlign: "top" }}>
                          <span style={{ color: "#16a34a", marginRight: "10px", fontWeight: 700 }}>✓</span>
                          <strong>Optimal positioning</strong> for maximum production
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: "14px", color: "#374151", padding: "8px 0", verticalAlign: "top" }}>
                          <span style={{ color: "#16a34a", marginRight: "10px", fontWeight: 700 }}>✓</span>
                          <strong>Easier maintenance</strong> and cleaning
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: "14px", color: "#374151", padding: "8px 0", verticalAlign: "top" }}>
                          <span style={{ color: "#16a34a", marginRight: "10px", fontWeight: 700 }}>✓</span>
                          <strong>Keeps your roof warranty intact</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* Independence Benefits */}
                <tr>
                  <td style={{ padding: "0 24px 24px" }}>
                    <div style={{
                      backgroundColor: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      borderRadius: "12px",
                      padding: "20px",
                    }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#065f46", marginBottom: "16px" }}>
                        What Energy Independence Means for You
                      </div>
                      <table style={{ width: "100%" }}>
                        <tr>
                          <td style={{ fontSize: "14px", color: "#065f46", padding: "6px 0", verticalAlign: "top" }}>
                            <span style={{ marginRight: "10px" }}>⚡</span>
                            Lock in your energy costs — no more rate hikes
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: "14px", color: "#065f46", padding: "6px 0", verticalAlign: "top" }}>
                            <span style={{ marginRight: "10px" }}>🏠</span>
                            Power you own outright, on your property
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: "14px", color: "#065f46", padding: "6px 0", verticalAlign: "top" }}>
                            <span style={{ marginRight: "10px" }}>📈</span>
                            25+ year asset that increases property value
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: "14px", color: "#065f46", padding: "6px 0", verticalAlign: "top" }}>
                            <span style={{ marginRight: "10px" }}>🌵</span>
                            Built for Texas weather and rural properties
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                {/* CTA */}
                <tr>
                  <td style={styles.ctaWrap}>
                    <a href={calendlyUrl} style={styles.cta}>
                      Schedule Your Site Visit
                    </a>
                    <a href={`tel:${supportPhone.replace(/[^\d]/g, '')}`} style={styles.ctaSecondary}>
                      Or call: {supportPhone}
                    </a>
                    <div style={{ marginTop: "16px", fontSize: "14px", color: "#374151", textAlign: "center" as const }}>
                      <strong>Ready to move forward?</strong> We&apos;ll visit your property, confirm the design, and handle everything from permits to installation.
                    </div>
                  </td>
                </tr>

                {/* Soft Qualifier */}
                <tr>
                  <td style={{ padding: "0 24px 24px" }}>
                    <div style={{
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      padding: "16px",
                      fontSize: "13px",
                      color: "#6b7280",
                      textAlign: "center" as const,
                      lineHeight: "20px",
                    }}>
                      <strong style={{ color: "#374151" }}>Looking for $0-down financing or a lease option?</strong>
                      <br />
                      We work with partners who offer those programs — just reply and we&apos;ll connect you.
                    </div>
                  </td>
                </tr>

                {/* Footer */}
                <tr>
                  <td style={styles.footer}>
                    <table style={styles.table}>
                      <tr>
                        <td>
                          <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "18px" }}>
                            Quote generated {date} • Typical install: {installationTimeline}
                          </div>
                          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                            This estimate is valid for 30 days. Final pricing confirmed after site visit.
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ paddingTop: "16px" }}>
                          <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                            © 2025 {brandName} •{" "}
                            <a href={`mailto:${supportEmail}`} style={{ color: "#6b7280" }}>{supportEmail}</a>
                            {" "}•{" "}
                            <a href={`tel:${supportPhone.replace(/[^\d]/g, '')}`} style={{ color: "#6b7280" }}>{supportPhone}</a>
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
