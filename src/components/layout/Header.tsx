'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import Button from '@/components/common/Button';
import { NAV_LINKS_HREF, NAV_LINKS_TEXT } from '@/constants/navigation';
import { NavLink } from '@/types';
import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const pathname: string = usePathname();
  const navLinks: NavLink[] = [
    { href: NAV_LINKS_HREF.ABOUT, label: NAV_LINKS_TEXT.ABOUT },
    { href: NAV_LINKS_HREF.APPROACH, label: NAV_LINKS_TEXT.APPROACH },
    { href: NAV_LINKS_HREF.QUOTE, label: NAV_LINKS_TEXT.QUOTE },
    { href: NAV_LINKS_HREF.FAQ, label: NAV_LINKS_TEXT.FAQ },
    { href: NAV_LINKS_HREF.CONTACT, label: NAV_LINKS_TEXT.CONTACT },
  ];

  const activeLinkClass = (href: string): string => {
    const activeClass: string = `relative after:content-[''] after:block after:absolute after:bottom-0 after:left-[10%] after:w-[76%] after:h-[1px] after:bg-custom-black`;
    return pathname.startsWith(href) ? activeClass : '';
  };

  const slideVariants: {
    hidden: { x: string };
    visible: { x: number };
    exit: { x: string };
  } = {
    hidden: { x: '-100%' },
    visible: { x: 0 },
    exit: { x: '-100%' },
  };

  return (
    <header className="bg-white lg:border-b lg:border-neutral-100/70">
      <div className="max-w-7xl mx-auto px-6 py-4 lg:px-[40px] lg:pt-[16px] lg:pb-[8px]">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            {/* Hamburger Menu */}
            <button
              className="md:hidden p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Logo */}
            <div className="flex-shrink-0 ml-2 lg:ml-0">
              <Link href='/'>
                <Image
                  src="/images/logo.png"
                  alt="Logo"
                  width={210}
                  height={52}
                  className="h-[32px] lg:h-[52px] w-auto"
                />
              </Link>
            </div>
          </div>

          {/* Navigation Links - Desktop */}
          <nav className="hidden md:flex space-x-[18px]">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-base font-medium"
              >
                <span className={twMerge('pb-6', activeLinkClass(link.href))}>{link.label}</span>
              </Link>
            ))}
          </nav>

          {/* Navigation Links - Mobile */}
          {isMenuOpen && (
            <nav className="fixed top-0 left-0 right-0 bottom-0 bg-black/25 md:hidden z-50">
              <motion.div
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={slideVariants}
                transition={{ type: 'spring', stiffness: 400, damping: 50 }}
                className="relative w-[339px] h-screen bg-white shadow-lg mr-auto">
                <div className="flex justify-between items-center px-6 py-4">
                  <div className="flex-shrink-0">
                    <Link href='/' onClick={() => setIsMenuOpen(false)}>
                      <Image
                        src="/images/logo.webp"
                        alt="Logo"
                        width={160}
                        height={40}
                        className="h-[32px] w-auto"
                      />
                    </Link>
                  </div>
                  <button
                    onClick={() => setIsMenuOpen(false)}
                    className="p-2"
                    aria-label="Close menu"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-col py-4 pl-10 pr-2">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-base font-medium mb-5 last:mb-0 mt-[18px] first:mt-0"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <span className={twMerge('pb-4', activeLinkClass(link.href))}>{link.label}</span>
                    </Link>
                  ))}
                </div>
                <Button
                  href={NAV_LINKS_HREF.QUOTE}
                  type="secondary"
                  size="big"
                  className="ml-10 mt-4 capitalize"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Get a free quote
                </Button>
              </motion.div>
            </nav>
          )}

          {/* CTA Button */}
          <Button
            href={NAV_LINKS_HREF.QUOTE}
            type="secondary"
            size="responsive"
          >
            Get a free quote
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
