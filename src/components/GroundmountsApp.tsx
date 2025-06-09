"use client";

import StateDropdown from "@/components/common/StateDropdown";
import {
  defaultInitialRevealY,
} from "@/constants/animation";

import { motion } from "framer-motion";
import Image from "next/image";

// src/components/GroundmountsApp.tsx
export default function GroundmountsApp() {
  return (
    <main className="bg-white overflow-clip">
      {/* hero section */}
      <div className="border-b border-neutral-300 relative">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row px-4 py-[60px] lg:px-10 lg:py-5 lg:justify-between lg:items-center relative z-10">
          <div className="flex flex-col w-full lg:w-[669px]">
            <div className="flex flex-row items-center text-xs font-medium tracking-widest w-fit border border-neutral-300 px-4 py-2">
              <Image
                src="/images/icons/solar-icon.svg"
                alt="solar icon"
                width={20}
                height={20}
              />
              <div className="ml-3 text-xs font-medium tracking-[0.06em]">
                SAVE YOUR ROOF
              </div>
            </div>
            <motion.h1
              className="text-[44px] lg:text-[62px] font-medium lg:font-normal leading-[57.2px] lg:leading-[73.16px] lg:tracking-[-1px] mt-6 lg:mt-9"
              {...defaultInitialRevealY}
            >
              Design your own ground mount solar system in 3 minutes
            </motion.h1>
            <motion.p
              className="text-base font-medium lg:text-lg text-neutral-400 mt-6 lg:mt-9"
              {...defaultInitialRevealY}
              transition={{ delay: 0.5 }}
            >
              Start here.
            </motion.p>
            <StateDropdown />
          </div>
          <div className="relative mt-[60px] lg:mt-0">
            <div className="absolute inset-0 z-0 w-[596px] lg:w-[1153px] h-[431px] lg:h-[834px] left-[-126px] lg:left-[-163px] bottom-[-48px] lg:bottom-[-158px]">
              <Image
                src="/images/panels.png"
                alt="panels background"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div className="w-full h-auto lg:w-auto lg:h-[689px] lg:relative lg:right-[-20px]">
              <Image
                src="/images/hero.webp"
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
