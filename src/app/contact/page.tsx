"use client";

import Button from '@/components/common/Button';
import { defaultInitialRevealX, defaultInitialRevealY } from '@/constants/animation';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function ContactPage() {

  return (
    <main className="bg-white overflow-clip">
      <div className="border-b border-neutral-300 bg-[size:auto_431px] lg:bg-[size:auto_834.12px]">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row px-4 py-[64px] lg:px-10 lg:pt-5 lg:pb-6 lg:justify-between lg:items-center">
          <div className="flex flex-col w-full lg:w-[40%]">
            <motion.h1 {...defaultInitialRevealY} className="text-4xl lg:text-[62px] font-medium lg:font-normal leading-[41.6px] lg:leading-[73.16px] lg:tracking-[-1px]">Get in touch</motion.h1>
            <motion.p {...defaultInitialRevealY} transition={{ delay: 0.3 }} className="font-medium text-lg text-neutral-400 mt-6 lg:mt-8">We’d love to hear from you! Whether you have questions, feedback, or just want to say hello, feel free to reach out.</motion.p>
            <motion.div {...defaultInitialRevealX} transition={{ delay: 0.5 }}>
              <Button type="secondary" size="big" href="mailto:info@groundmounts.com" className="mt-9 w-fit px-[34px] py-[10px] font-medium">
                <Image src="/images/icons/envelope.webp" alt="email icon" width={32} height={32} className="mr-[10px]"/>
                Email Us
              </Button>
            </motion.div>
            <motion.p {...defaultInitialRevealY} transition={{ delay: 0.7 }} className="font-medium text-lg text-neutral-400 mt-4">For any inquiries, please email us at:</motion.p>
            <motion.p {...defaultInitialRevealY} transition={{ delay: 0.9 }} className="font-medium text-lg text-custom-primary mt-1">info@groundmounts.com</motion.p>
            <motion.p {...defaultInitialRevealY} transition={{ delay: 1.1 }} className="font-medium text-lg text-neutral-400 mt-4">We’ll get back to you as soon as possible.</motion.p>
          </div>
          <div className="relative">
            <div className="absolute inset-0 z-0 w-[1153px] h-[834px] left-[-163px] bottom-[-158px]">
              <Image
                src="/images/panels.png"
                alt="panels background"
                fill
                className="object-contain lg:object-contain object-right-bottom lg:object-right-top"
                priority
              />
            </div>
            <div className="w-full h-auto lg:w-auto lg:h-[689px] mt-[60px] lg:mt-0 lg:relative lg:right-[-20px]">
              <Image
                src="/images/contact.webp"
                alt="hero image"
                width={595}
                height={689}
                className="w-full h-full object-contain relative z-10"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
