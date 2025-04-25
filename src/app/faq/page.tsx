"use client";

import Image from 'next/image';
import Button from '@/components/common/Button';
import Accordion from '@/components/common/Accordion';
import { FaqItem } from '@/types';
import { FAQ_ITEMS } from '@/constants/homepage';
import { motion } from 'framer-motion';
import { defaultInitialRevealX, defaultInitialRevealY } from '@/constants/animation';
import { useEffect, useState } from 'react';
export default function FAQPage() {
  const faqItems: FaqItem[] = FAQ_ITEMS;
  const [backgroundPosition, setBackgroundPosition] = useState<{ backgroundPositionX: string, backgroundPositionY: string } | undefined>(undefined);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBackgroundPosition({
        backgroundPositionX: window.innerWidth >= 1024 ? 'calc(50% + 502px)' : '-126px',
        backgroundPositionY: window.innerWidth >= 1024 ? '33.47px' : 'calc(100% - 12px)'
      });
    }
  }, []);
  return (
    <main className="bg-white bg-[size:auto_431px] lg:bg-[size:auto_834.12px] bg-no-repeat bg-left-bottom bg-[url('/images/panels.png')]" style={backgroundPosition}>
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row px-4 py-[60px] lg:px-10 lg:py-5 lg:justify-between lg:items-center">
        <div className="flex flex-col w-full lg:w-[669px]">
          <motion.h1 {...defaultInitialRevealY} className="text-[44px] lg:text-[62px] leading-[51.92px] lg:leading-[73.16px] mt-6 lg:mt-9 lg:tracking-[-1px]">Frequently Asked Question</motion.h1>
          <motion.p {...defaultInitialRevealY} transition={{ delay: 0.3 }} className="text-base font-medium lg:text-lg text-neutral-400 mt-4 lg:mt-8">Questions about Ground Mounts</motion.p>
          <motion.p {...defaultInitialRevealY} transition={{ delay: 0.5 }} className="text-sm font-medium text-neutral-400 mt-6 lg:mt-9">Have other questions?</motion.p>
          <motion.div {...defaultInitialRevealX} transition={{ delay: 0.7 }}><Button type="secondary" size="big" href="mailto:info@groundmounts.com" className="mt-4 w-fit px-[40px] py-[14px]">Contact us</Button></motion.div>
        </div>
        <Image src="/images/faq-page.png" alt="faq image" width={595} height={689} className="w-full h-auto lg:w-auto lg:h-[689px] mt-[48px] lg:mt-0 lg:relative lg:right-[-20px]"/>
      </div>
      <div className="max-w-7xl mx-auto py-[64px] px-4 lg:p-[200px]">
        <Accordion items={faqItems} icon="chevron"/>
      </div>
    </main>
  );
}
