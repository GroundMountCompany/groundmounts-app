import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import '@/styles/globals.css';
import { twMerge } from 'tailwind-merge';

const manrope = Manrope({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'The Ground Mount Company',
  description: 'Design your own ground mount solar system in 3 minutes',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
    other: [
      { rel: 'android-chrome-192x192', url: '/android-chrome-192x192.png' },
      { rel: 'android-chrome-512x512', url: '/android-chrome-512x512.png' },
    ],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    title: 'The Ground Mount Company',
    description: 'Design your own ground mount solar system in 3 minutes',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'The Ground Mount Company',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={twMerge(manrope.className, 'bg-white overflow-x-hidden')}>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
