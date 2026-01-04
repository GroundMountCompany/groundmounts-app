import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import '@/styles/globals.css';
import Script from 'next/script';
import { getBrand } from "@/config/getBrand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const brand = getBrand();

export const metadata: Metadata = {
  title: brand.metaTitle,
  description: brand.metaDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased touch-manipulation overscroll-contain`}>
        {children}

        <Script id="fb-pixel-loader" strategy="lazyOnload">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
          n.callMethod? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
          if(!f._fbq) f._fbq=n; n.push=n; n.loaded=!0; n.version='2.0';
          n.queue=[]; t=b.createElement(e); t.async=!0; t.src=v;
          s=b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t,s)
          }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');`}
        </Script>

        <Script id="fb-pixel-init" strategy="lazyOnload">
          {`try {
            fbq('init','1711326086132514');
            fbq('track','PageView');
            if (typeof window !== 'undefined' && window._fbqQueue) {
              for (const args of window._fbqQueue) {
                try { window.fbq(...args); } catch {}
              }
              window._fbqQueue = [];
            }
          } catch(e) { /* swallow */ }`}
        </Script>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <noscript><img height="1" width="1" style={{display:'none'}} src="https://www.facebook.com/tr?id=1711326086132514&ev=PageView&noscript=1" alt="" /></noscript>
      </body>
    </html>
  );
}
