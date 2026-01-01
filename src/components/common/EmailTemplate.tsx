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
  fedralTax?: string;
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
    padding: "24px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "#111827",
    borderTopLeftRadius: "16px",
    borderTopRightRadius: "16px",
  } as React.CSSProperties,
  h1: { margin: 0, fontSize: "22px", lineHeight: "30px", fontWeight: 800, color: "#ffffff" } as React.CSSProperties,
  section: { padding: "24px" } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } as React.CSSProperties,
  label: { fontSize: "11px", color: "#6b7280", letterSpacing: ".04em", textTransform: "uppercase" as const } as React.CSSProperties,
  value: { fontSize: "15px", fontWeight: 600, color: "#111827" } as React.CSSProperties,
  costRow: { fontSize: "14px", color: "#111827", padding: "8px 0" } as React.CSSProperties,
  highlight: {
    backgroundColor: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
  } as React.CSSProperties,
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
  monthlyBill = 0,
  offsetPercentage = 100,
  date = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
  installationTimeline = "2-3 weeks",
}: QuoteEmailProps): React.JSX.Element {

  // Calculate ROI metrics
  const federalCredit = Math.round(totalCostRaw * 0.30);
  const netCost = totalCostRaw - federalCredit;
  const estimatedMonthlySavings = Math.round(monthlyBill * (offsetPercentage / 100));
  const yearlySavings = estimatedMonthlySavings * 12;
  const paybackYears = yearlySavings > 0 ? Math.round((netCost / yearlySavings) * 10) / 10 : 0;
  const twentyYearSavings = yearlySavings * 20;

  const formatCurrency = (n: number) => `$${n.toLocaleString()}`;

  const emailPreview = previewText || `Your ${totalPanels}-panel ground mount quote: ${formatCurrency(netCost)} after tax credit`;

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
                {/* Header */}
                <tr>
                  <td style={styles.header}>
                    <h1 style={styles.h1}>Your Ground Mount Quote is Ready</h1>
                    <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#9ca3af" }}>
                      {totalPanels} panels • {systemSizeKw.toFixed(1)} kW system • {address}
                    </p>
                  </td>
                </tr>

                {/* Big Number - Net Cost After Tax Credit */}
                <tr>
                  <td style={{ padding: "24px", textAlign: "center" as const }}>
                    <div style={{ fontSize: "12px", color: "#6b7280", letterSpacing: ".04em", textTransform: "uppercase" as const }}>
                      YOUR TOTAL INVESTMENT
                    </div>
                    <div style={{ fontSize: "42px", fontWeight: 800, color: "#111827", margin: "8px 0" }}>
                      {formatCurrency(netCost)}
                    </div>
                    <div style={{ fontSize: "14px", color: "#16a34a", fontWeight: 600 }}>
                      After 30% Federal Tax Credit ({formatCurrency(federalCredit)} savings)
                    </div>
                  </td>
                </tr>

                {/* ROI Highlight Box */}
                <tr>
                  <td style={{ padding: "0 24px" }}>
                    <div style={styles.highlight}>
                      <table style={styles.table}>
                        <tr>
                          <td style={{ textAlign: "center" as const, padding: "8px" }}>
                            <div style={{ fontSize: "24px", fontWeight: 700, color: "#059669" }}>{paybackYears} years</div>
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>Payback Period</div>
                          </td>
                          <td style={{ textAlign: "center" as const, padding: "8px", borderLeft: "1px solid #a7f3d0" }}>
                            <div style={{ fontSize: "24px", fontWeight: 700, color: "#059669" }}>{formatCurrency(estimatedMonthlySavings)}/mo</div>
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>Est. Monthly Savings</div>
                          </td>
                          <td style={{ textAlign: "center" as const, padding: "8px", borderLeft: "1px solid #a7f3d0" }}>
                            <div style={{ fontSize: "24px", fontWeight: 700, color: "#059669" }}>{formatCurrency(twentyYearSavings)}</div>
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>20-Year Savings</div>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                {/* Cost Breakdown */}
                <tr>
                  <td style={styles.section}>
                    <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px" }}>Cost Breakdown</div>
                    <table style={styles.table}>
                      <tr>
                        <td style={styles.costRow}>
                          System Cost ({totalPanels} panels × 400W)
                        </td>
                        <td align="right" style={{ ...styles.costRow, fontWeight: 600 }}>
                          {formatCurrency(systemCostRaw)}
                        </td>
                      </tr>
                      {trenchingCostRaw > 0 && (
                        <tr>
                          <td style={styles.costRow}>
                            Trenching ({trenchingDistance} ft × $45/ft)
                          </td>
                          <td align="right" style={{ ...styles.costRow, fontWeight: 600 }}>
                            {formatCurrency(trenchingCostRaw)}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ ...styles.costRow, borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
                          Subtotal
                        </td>
                        <td align="right" style={{ ...styles.costRow, borderTop: "1px solid #e5e7eb", paddingTop: "12px", fontWeight: 600 }}>
                          {formatCurrency(totalCostRaw)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ ...styles.costRow, color: "#16a34a" }}>
                          30% Federal Tax Credit
                        </td>
                        <td align="right" style={{ ...styles.costRow, color: "#16a34a", fontWeight: 600 }}>
                          -{formatCurrency(federalCredit)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ ...styles.costRow, fontSize: "16px", fontWeight: 700, borderTop: "2px solid #111827", paddingTop: "12px" }}>
                          Net Cost to You
                        </td>
                        <td align="right" style={{ ...styles.costRow, fontSize: "20px", fontWeight: 800, borderTop: "2px solid #111827", paddingTop: "12px" }}>
                          {formatCurrency(netCost)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* Why Ground Mount */}
                <tr>
                  <td style={{ padding: "0 24px 24px" }}>
                    <div style={{
                      backgroundColor: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: "8px",
                      padding: "16px",
                    }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#92400e", marginBottom: "12px" }}>
                        Why Texas Homeowners Choose Ground Mounts
                      </div>
                      <table style={{ width: "100%" }}>
                        <tr>
                          <td style={{ fontSize: "13px", color: "#78350f", padding: "4px 0", verticalAlign: "top" }}>
                            <span style={{ color: "#16a34a", marginRight: "8px" }}>✓</span>
                            <strong>Perfect angle</strong> — optimized for Texas sun, not your roof pitch
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: "13px", color: "#78350f", padding: "4px 0", verticalAlign: "top" }}>
                            <span style={{ color: "#16a34a", marginRight: "8px" }}>✓</span>
                            <strong>No roof damage</strong> — zero penetrations, keeps warranty intact
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: "13px", color: "#78350f", padding: "4px 0", verticalAlign: "top" }}>
                            <span style={{ color: "#16a34a", marginRight: "8px" }}>✓</span>
                            <strong>Easy maintenance</strong> — accessible for cleaning and repairs
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: "13px", color: "#78350f", padding: "4px 0", verticalAlign: "top" }}>
                            <span style={{ color: "#16a34a", marginRight: "8px" }}>✓</span>
                            <strong>Expandable</strong> — add more panels when you need them
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                {/* Social Proof */}
                <tr>
                  <td style={{ padding: "0 24px 16px", textAlign: "center" as const }}>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      <strong style={{ color: "#111827" }}>500+ Texas homeowners</strong> have used our design tool
                      <br />
                      <span style={{ fontSize: "12px" }}>Local team • {installationTimeline} typical install</span>
                    </div>
                  </td>
                </tr>

                {/* CTA */}
                <tr>
                  <td style={styles.ctaWrap}>
                    <a href={calendlyUrl} style={styles.cta}>
                      Schedule Your Free Consultation
                    </a>
                    <a href={`tel:${supportPhone.replace(/[^\d]/g, '')}`} style={styles.ctaSecondary}>
                      Or call us: {supportPhone}
                    </a>
                    <div style={{ marginTop: "16px", fontSize: "13px", color: "#6b7280", textAlign: "center" as const }}>
                      <strong>Ready to move forward?</strong> Reply to this email or call — we&apos;ll walk you through the next steps.
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
                            Quote generated {date}
                          </div>
                          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                            This estimate is valid for 30 days. Final pricing may vary based on site inspection.
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ paddingTop: "16px" }}>
                          <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                            © 2024 {brandName} •{" "}
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
