import * as React from 'react';

export interface EmailLineItem {
  key: string;
  label: string;
  detail?: string;
  amount: number;
}

export interface EmailTemplateProps {
  client: string;
  address: string;
  totalPanels: number;
  systemSizeKw: number;
  trenchingDistance: number;
  annualProductionKwh: number;
  lineItems: EmailLineItem[];
  estimate: number;
  priceLow: number;
  priceHigh: number;
  date: string;
  calendlyUrl: string;
}

const money = (amount: number) =>
  amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/**
 * The quote email.
 *
 * Renders the priced quote it is handed and nothing else. It used to derive its
 * own annual production from a hardcoded kWh-per-kW figure, which meant the
 * email and the screen could quietly disagree about the same system.
 *
 * Phase 7 makes this brand-matched; the copy below is deliberately plain until
 * then.
 */
export default function EmailTemplate({
  client,
  address,
  totalPanels,
  systemSizeKw,
  trenchingDistance,
  annualProductionKwh,
  lineItems,
  estimate,
  priceLow,
  priceHigh,
  date,
  calendlyUrl,
}: EmailTemplateProps) {
  const cell: React.CSSProperties = {
    padding: '10px 0',
    borderBottom: '1px solid #e5e5e5',
    fontSize: '16px',
  };

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        maxWidth: '600px',
        margin: '0 auto',
        color: '#171717',
      }}
    >
      <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>Your ground mount estimate</h1>
      <p style={{ color: '#666', fontSize: '15px', marginTop: 0 }}>
        {address} &middot; {date}
      </p>

      <div
        style={{
          border: '1px solid #e5e5e5',
          borderRadius: '10px',
          padding: '20px',
          textAlign: 'center',
          margin: '20px 0',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px', color: '#666', letterSpacing: '0.05em' }}>
          YOUR RANGE
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '26px', fontWeight: 700 }}>
          {money(priceLow)} &ndash; {money(priceHigh)}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#666' }}>
          An estimate from the design you drew. The real number comes after a site visit.
        </p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...cell, color: '#666' }}>Panels</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{totalPanels}</td>
          </tr>
          <tr>
            <td style={{ ...cell, color: '#666' }}>System size</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{systemSizeKw} kW</td>
          </tr>
          <tr>
            <td style={{ ...cell, color: '#666' }}>Estimated production</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>
              {annualProductionKwh.toLocaleString()} kWh/yr
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, color: '#666' }}>Trench</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>
              {trenchingDistance} ft
            </td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: '17px', marginTop: '24px', marginBottom: '8px' }}>
        What that covers
      </h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {lineItems.map((item) => (
            <tr key={item.key}>
              <td style={{ ...cell, color: '#666' }}>
                {item.label}
                {item.detail ? (
                  <span style={{ display: 'block', fontSize: '14px', color: '#999' }}>
                    {item.detail}
                  </span>
                ) : null}
              </td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>
                {money(item.amount)}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Estimate</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{money(estimate)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: '24px' }}>
        <a
          href={calendlyUrl}
          style={{
            display: 'inline-block',
            background: '#15803d',
            color: '#ffffff',
            padding: '14px 24px',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Book a call
        </a>
      </div>

      <p style={{ marginTop: '24px', fontSize: '13px', color: '#999' }}>
        Sent to {client}. Reply to this email if anything looks wrong.
      </p>
    </div>
  );
}
