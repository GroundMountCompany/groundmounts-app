'use client';

import { NAV_LINKS_HREF, NAV_LINKS_TEXT } from '@/constants/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Button from '@/components/common/Button';
import { useState } from 'react';
import { saveToSpreadsheet } from '@/lib/spreadsheetUtils';
import { TAB_NAME } from '@/constants/quote';

const Footer = () => {
  const navLinks = [
    { href: NAV_LINKS_HREF.ABOUT, label: NAV_LINKS_TEXT.ABOUT },
    { href: NAV_LINKS_HREF.APPROACH, label: NAV_LINKS_TEXT.APPROACH },
    { href: NAV_LINKS_HREF.QUOTE, label: NAV_LINKS_TEXT.QUOTE },
    { href: NAV_LINKS_HREF.FAQ, label: NAV_LINKS_TEXT.FAQ },
    { href: NAV_LINKS_HREF.CONTACT, label: NAV_LINKS_TEXT.CONTACT },
  ];

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    try {
      setIsLoading(true);

      const emailPayload = {
        email: email,
        date: new Intl.DateTimeFormat(navigator.language, {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(new Date()),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        source: 'footer'
      }
      await saveToSpreadsheet(process.env.NEXT_PUBLIC_SPREADSHEET_ID || '', TAB_NAME.EMAIL, emailPayload);
    } catch (error) {
      console.error('Error in handleSubscribe:', error);
    } finally {
      setIsLoading(false);
      setEmail('');
    }
  };

  return (
    <footer className="bg-custom-primary text-white relative z-10">
      <div className="flex flex-col items-center justify-center py-[60px] lg:pt-[80px] lg:pb-0">
        <div className="border-0 lg:border-b lg:border-white/20 w-full mx-auto lg:pb-[60px]">
          <div className="flex flex-col lg:flex-row items-center justify-center lg:justify-between max-w-7xl mx-4 lg:mx-auto lg:px-10 border-b border-white/20 lg:border-0 pb-6 lg:pb-0">
            <div className="flex-shrink-0 mb-6 lg:mb-0 border-b border-white/20 lg:border-0 w-full lg:w-auto pb-6 lg:pb-0">
              <Link href={NAV_LINKS_HREF.ABOUT} className="flex items-center justify-center">
                <Image
                  src="/images/logo-inverted.svg"
                  alt="Logo"
                  width={210}
                  height={40}
                  className="h-10 lg:h-[120px] w-auto"
                />
              </Link>
            </div>
            <nav className="flex flex-col items-center lg:justify-start lg:flex-row lg:space-x-10 space-y-8 lg:space-y-0">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <div className="border-0 lg:border-b lg:border-white/20 w-full pt-6 lg:py-[80px]">
          <div className="flex flex-col lg:flex-row text-center lg:text-left items-center justify-center lg:justify-between max-w-7xl lg:mx-auto mx-4 lg:px-10 border-b border-white/20 lg:border-0 pb-6 lg:pb-0">
            <h3 className="text-3xl font-medium w-full lg:w-auto mb-2 lg:mb-0">Stay Updated</h3>
            <p className="w-full lg:w-[325px] mb-10 lg:mb-0 px-2 lg:px-0 text-sm lg:text-base">Subscribe for our free newsletter for latest updates, articles, and more</p>
            <div className="flex flex-col items-center justify-center w-full lg:w-[555px]">
              <div className="flex flex-row items-center lg:justify-between bg-white rounded-full pl-5 pr-2 lg:pl-4 lg:pr-2 py-2 w-full">
                <input
                  type="email"
                  placeholder="Email Address"
                  className="w-1/2 lg:w-auto shrink grow-0 lg:shrink-0 lg:grow text-custom-primary outline-none pr-2 flex-grow text-lg lg:text-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  type="secondary"
                  size="big"
                  className="grow shrink-0 lg:grow-0 shrink justify-center"
                  isLoading={isLoading}
                  onClick={handleSubscribe}
                >Subscribe</Button>
              </div>
              <p className="text-sm mt-4 lg:mt-5">By providing your email, you are consenting to receive communications from Ground Mounts. Visit our Privacy Policy for more info.</p>
            </div>
          </div>
        </div>
        <div className="w-full pt-5 lg:py-6">
          <div className="flex flex-col lg:flex-row items-center justify-center lg:justify-between max-w-7xl mx-auto px-4 lg:px-10">
            <p className="text-xs">Copyright © 2024 The Ground Mount Company</p>
            <div className="flex flex-row items-center justify-center mt-4 lg:mt-0">
              <p className="text-xs mr-6">Follow us</p>
              <div className="flex flex-row items-center justify-center space-x-5">
                <Link href={process.env.NEXT_PUBLIC_YOUTUBE_LINK || ''} target="_blank" rel="noopener noreferrer">
                  <Image src="/images/icons/socials/youtube-icon.png" alt="Youtube" width={16} height={16} />
                </Link>
                <Link href={process.env.NEXT_PUBLIC_FACEBOOK_LINK || ''} target="_blank" rel="noopener noreferrer">
                  <Image src="/images/icons/socials/facebook-icon.png" alt="Facebook" width={16} height={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
