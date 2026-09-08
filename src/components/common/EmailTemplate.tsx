import * as React from 'react';
import { projectResults, type ResultsInput } from '@/lib/results';

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
  /**
   * Signed links that record when a call would suit them.
   *
   * Built by the caller, because signing needs the server's secret and this
   * component renders in a route. Empty when RESUME_SECRET is unset, and then
   * the section simply does not appear — a dead link in somebody's inbox is
   * worse than no link.
   */
  callTimeLinks?: Array<{ label: string; href: string }>;
  /** Who the quote is from, as the customer knows them. */
  brandName: string;
  brandColor: string;
  /** Absolute URL of the header logo. Falls back to the name if it cannot load. */
  brandLogoUrl: string;
  /**
   * What twenty-five years of doing nothing costs, if we know enough to say.
   *
   * A static table, not the chart: an inbox cannot run Recharts, and a chart
   * rendered to an image is one more thing that can arrive broken.
   */
  results?: ResultsInput;
  /** The design they drew, as a publicly reachable image. */
  mapScreenshotUrl?: string;
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
 * Brand-matched: the logo, colour and name are the ones on the funnel the
 * customer filled in, which for a partner embed is the neutral brand rather
 * than a company they have never heard of.
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
  callTimeLinks,
  brandName,
  brandColor,
  brandLogoUrl,
  mapScreenshotUrl,
  results,
}: EmailTemplateProps) {
  const projection = results ? projectResults(results) : null;
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
      {/*
        The logo, with the brand name as its alt text.

        Absolute, because an inbox has no origin to resolve a path against —
        the old relative path is what produced a broken image icon at the top
        of every quote. An inbox that blocks remote images shows the alt text,
        which is the wordmark, so the header still says who this is from.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- an email client
          renders plain HTML; next/image would emit markup no inbox can use. */}
      <img
        src={brandLogoUrl}
        alt={brandName}
        style={{
          display: 'block',
          maxHeight: '44px',
          marginBottom: '12px',
          color: brandColor,
          fontSize: '18px',
          fontWeight: 700,
        }}
      />
      <h1 style={{ fontSize: '22px', marginBottom: '4px', color: brandColor }}>
        Your ground mount estimate
      </h1>
      <p style={{ color: '#666', fontSize: '15px', marginTop: 0 }}>
        {address} &middot; {date}
      </p>

      {/* The design they drew, above the number it produced. Nothing else in
          the email says what this quote is *of*. */}
      {mapScreenshotUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- an email client
           renders plain HTML; next/image would emit markup no inbox can use. */
        <img
          src={mapScreenshotUrl}
          alt="Your panel layout"
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '600px',
            borderRadius: '10px',
            border: '1px solid #e5e5e5',
            margin: '20px 0 0',
          }}
        />
      ) : null}

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

      {projection ? (
        <>
          <h2 style={{ fontSize: '17px', marginTop: '24px', marginBottom: '8px' }}>
            What it costs to do nothing
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...cell, color: '#666' }}>Paid back in year</td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>
                  {projection.paybackYear === null
                    ? "Not within 25 years"
                    : `${projection.paybackYear} (${projection.paybackCalendarYear})`}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, color: '#666' }}>25 years of utility bills</td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>
                  {money(projection.totalWithout)}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, color: '#666' }}>This system</td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>
                  {money(projection.systemPriceUsd)}
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: '10px', fontSize: '15px', color: '#444' }}>
            In {projection.final.calendarYear} at this rate your bill is{' '}
            <strong>{money(projection.final.withoutMonthly)}</strong>/month. With this system:{' '}
            <strong>{money(projection.final.residualMonthly)}</strong>/month.
          </p>
          <p style={{ marginTop: '10px', fontSize: '15px', color: '#444' }}>
            Spread over {projection.assumptions.horizonYears} years, this system works out to{' '}
            <strong>{money(projection.monthlyEquivalent)}</strong>/month.
          </p>
          <p style={{ marginTop: '6px', fontSize: '13px', color: '#999' }}>
            Assumes the utility raises its rates {projection.inflationPct}% a year and the panels
            lose {projection.assumptions.degradationPctPerYear}% of their output a year, over{' '}
            {projection.assumptions.horizonYears} years. Assumes you pay cash. Financing changes
            the picture.
          </p>
        </>
      ) : null}

      {/* The three facts, as text. No image: an inbox that blocks remote
          images would drop the whole point of the section, and this reads
          perfectly well as a list. */}
      <h2 style={{ fontSize: '17px', marginTop: '24px', marginBottom: '8px' }}>
        Why people do this
      </h2>
      <p style={{ margin: '0 0 8px', fontSize: '15px', color: '#444' }}>
        Payback is one reason. Reliability is the other.
      </p>
      {/*
        The same question the success screen asks, as three plain links.

        Links rather than buttons and no JavaScript: an inbox runs none, and a
        customer who read the email on their phone at breakfast should be able
        to answer it there rather than being sent back into the funnel. Each
        one carries the same HMAC the resume links use, so the answer can be
        trusted without a session behind it.
      */}
      {callTimeLinks && callTimeLinks.length > 0 ? (
        <div style={{ marginTop: '24px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 600 }}>
            We&rsquo;ll reach out within one business day. When&rsquo;s a good time?
          </p>
          <table role="presentation" cellPadding={0} cellSpacing={0}>
            <tbody>
              <tr>
                {callTimeLinks.map((link) => (
                  <td key={link.label} style={{ paddingRight: '8px' }}>
                    <a
                      href={link.href}
                      style={{
                        display: 'inline-block',
                        border: `1px solid ${brandColor}`,
                        borderRadius: '10px',
                        color: brandColor,
                        padding: '12px 18px',
                        textDecoration: 'none',
                        fontWeight: 600,
                        fontSize: '16px',
                      }}
                    >
                      {link.label}
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <p style={{ marginTop: '24px', fontSize: '15px', color: '#525252' }}>
        Questions? <a href="mailto:bert@groundmounts.com">bert@groundmounts.com</a>
      </p>

      <p style={{ marginTop: '12px', fontSize: '13px', color: '#999' }}>
        Sent to {client} by {brandName}. Reply to this email if anything looks wrong.
      </p>
    </div>
  );
}
