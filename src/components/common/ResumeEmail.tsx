import * as React from 'react';
import { RESUME_EMAIL } from '@/config/copy';

export interface ResumeEmailProps {
  /** The signed link back into the funnel. Absolute — an inbox has no origin. */
  resumeUrl: string;
  /** Who it is from, as the customer knows them. */
  brandName: string;
  brandColor: string;
  brandLogoUrl: string;
  /** How many days the link has left, so the sentence can say a real number. */
  expiresInDays: number;
  /** What they had drawn, if there was anything to describe yet. */
  panels?: number;
}

/**
 * "Pick up where you left off."
 *
 * Deliberately short. This is not a quote — no price, no line items, nothing
 * to argue with — because nobody has been shown a price yet and an email that
 * looked like one would be a promise the funnel has not made. One sentence,
 * one button, and the honest expiry.
 *
 * Table layout and inline styles throughout, like the quote email beside it:
 * Outlook and Gmail's clipper between them remove most of what a modern
 * stylesheet would do, and a resume link that renders as unstyled text still
 * has to be clickable.
 */
export default function ResumeEmail({
  resumeUrl,
  brandName,
  brandColor,
  brandLogoUrl,
  expiresInDays,
  panels,
}: ResumeEmailProps) {
  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: '#171717',
        maxWidth: '560px',
        margin: '0 auto',
        padding: '24px',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandLogoUrl}
        alt={brandName}
        width="180"
        style={{ display: 'block', marginBottom: '24px', maxWidth: '180px' }}
      />

      <h1 style={{ fontSize: '24px', lineHeight: '1.3', margin: '0 0 12px' }}>
        {RESUME_EMAIL.heading}
      </h1>

      <p style={{ fontSize: '17px', lineHeight: '1.5', margin: '0 0 20px', color: '#404040' }}>
        {panels && panels > 0
          ? RESUME_EMAIL.bodyWithPanels(panels)
          : RESUME_EMAIL.bodyPlain}
      </p>

      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 20px' }}>
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: brandColor,
                borderRadius: '12px',
              }}
            >
              <a
                href={resumeUrl}
                style={{
                  display: 'inline-block',
                  padding: '16px 28px',
                  fontSize: '17px',
                  fontWeight: 600,
                  color: '#ffffff',
                  textDecoration: 'none',
                }}
              >
                {RESUME_EMAIL.cta}
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '15px', lineHeight: '1.5', margin: '0 0 8px', color: '#737373' }}>
        {RESUME_EMAIL.expiry(expiresInDays)}
      </p>
      <p style={{ fontSize: '15px', lineHeight: '1.5', margin: 0, color: '#737373' }}>
        {RESUME_EMAIL.reassurance}
      </p>
    </div>
  );
}
