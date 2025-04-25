"use client";

import Accordion from "@/components/common/Accordion";
import StateDropdown from "@/components/common/StateDropdown";
import {
  defaultInitialRevealY,
  defaultRevealY,
  transitionVariants,
} from "@/constants/animation";
import {
  COST_OF_ROOF_TABLE,
  FAQ_ITEMS,
  HERO_CARDS,
  SERVICES_CARDS,
} from "@/constants/homepage";
import { CostOfRoofTable, FaqItem, HeroCard, ServiceCard } from "@/types";
import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect } from "react";

export default function Home() {
  const heroCards: HeroCard[] = HERO_CARDS;
  const servicesCards: ServiceCard[] = SERVICES_CARDS;
  const costOfRoofTable: CostOfRoofTable[] = COST_OF_ROOF_TABLE;
  const faqItems: FaqItem[] = FAQ_ITEMS;

  useEffect(() => {
    const sheetsInit = async () => {
      await fetch('/api/setupSheets');
    }
    sheetsInit()
  }, [])
  

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
      <div className="border-b border-neutral-300 bg-white relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row px-4 py-[60px] lg:px-10 lg:py-[40px]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {heroCards.map((card, index) => (
              <div className="relative" key={index}>
                <Image
                  src={`/images/hero-card-${index + 1}.png`}
                  alt={`hero card ${index + 1}`}
                  width={440}
                  height={663}
                  className="w-full h-auto lg:w-auto lg:h-[663px]"
                />
                <motion.div
                  className="absolute bottom-[20px] left-[20px] right-[20px] bg-white flex flex-col p-6"
                  {...defaultRevealY}
                  transition={{ ...transitionVariants, delay: index * 0.15 }}
                >
                  <div className="text-xs font-medium border border-neutral-300 p-2 w-fit tracking-widest">
                    0{index + 1}
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-medium leading-[31.2px] lg:leading-[41.6px] mt-3 w-full lg:w-[293px] ">
                    {card.title}
                  </h3>
                  <p className="text-base text-neutral-400 mt-3">
                    {card.description}
                  </p>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* cost of roof section */}
      <div className="border-b border-neutral-300">
        <div className="max-w-7xl mx-auto flex flex-col px-4 pt-[60px] pb-5 lg:p-10 lg:pt-[100px]">
          <div className="text-xs font-medium border border-neutral-300 py-2 px-4 w-fit tracking-[0.06em]">
            02 · COSTS OF ROOF
          </div>
          <motion.h2
            className="text-4xl leading-[41.6px] lg:text-[56px] lg:leading-[66.08px] lg:tracking-[-1px] font-medium lg:font-normal mt-4 w-full lg:w-[732px]"
            {...defaultRevealY}
          >
            The Hidden Costs of Roof-Mounted Solar Panels
          </motion.h2>
        </div>
      </div>
      <div className="border-b border-neutral-300 bg-none lg:bg-[url('/images/cor-bg.png')] bg-no-repeat bg-[length:auto_100%] lg:bg-[position:-386px_144.11px] max-2xl:bg-[position:calc(45%-173px)_156.11px]">
        <div className="max-w-7xl mx-auto lg:flex lg:flex-row lg:justify-end px-4 py-5 lg:p-10">
          <div className="w-full overflow-x-auto lg:w-[876px]">
            <motion.table
              {...defaultRevealY}
              className="table-fixed border-collapse relative"
            >
              <thead>
                <tr className="border-t border-neutral-300/20 lg:border-0">
                  <th className="font-medium text-custom-black w-[123px] lg:w-auto sticky left-0 bg-white z-10 p-0 lg:p-[1px]">
                    <div className="w-[153px] h-[89px] lg:h-[80px] lg:w-auto pt-[21px] pb-5 pr-6 pl-4 border-x border-neutral-300 border-b-0 lg:border-0 flex items-center">
                      Hidden Cost
                    </div>
                  </th>
                  <th className="py-5 pr-6 pl-4 font-medium text-custom-black lg:w-auto">
                    <div className="w-[292px] lg:w-auto">
                      Roof-Mounted Solar Panels
                    </div>
                  </th>
                  <th className="py-5 pr-6 pl-4 font-medium text-custom-black lg:w-auto">
                    <div className="w-[193px] lg:w-auto">
                      <Image
                        src="/images/logo.png"
                        alt="Logo"
                        width={193}
                        height={48}
                        className="h-[48px] w-auto"
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {costOfRoofTable.map((row, index) => (
                  <tr key={index}>
                    <td className="text-custom-primary font-medium text-base lg:text-lg sticky left-0 bg-white z-10 p-0 border border-t border-t-white first:border-t-neutral-300 border-b border-b-neutral-300 lg:border-y-neutral-300 border-l-0 lg:border-l">
                      <div className="flex items-center absolute top-0 left-0 right-0 bottom-0 lg:static border border-x-1 border-y-0 border-neutral-300 pt-[21px] pb-5 pr-6 pl-4 lg:border-0">
                        {row.col1}
                      </div>
                    </td>
                    <td className="py-5 pr-6 pl-4 border border-l-0 border-neutral-300 text-base">
                      <div className="flex flex-row items-center">
                        <Image
                          src="/images/icons/close.webp"
                          alt="close icon"
                          width={18}
                          height={18}
                          className="mr-[10px] w-[18px] shrink-0"
                        />
                        {row.col2}
                      </div>
                    </td>
                    <td className="py-5 pr-6 pl-4 border border-neutral-300 bg-[#F6F8F9] text-base">
                      <div className="flex flex-row items-center">
                        <Image
                          src="/images/icons/checklist.webp"
                          alt="checklist icon"
                          width={18}
                          height={18}
                          className="mr-[10px] w-[18px] shrink-0"
                        />
                        {row.col3}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </motion.table>
          </div>
        </div>
      </div>
      {/* services section */}
      <div className="border-b border-neutral-300 bg-custom-primary text-white">
        <div className="max-w-7xl mx-auto flex flex-col px-4 py-[60px] pb-5 lg:p-10 lg:pt-[100px]">
          <div className="text-xs font-medium border border-[#214A8B] py-2 px-4 w-fit tracking-[0.06em]">
            03 · SERVICES
          </div>
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mt-4">
            <motion.h2
              className="text-4xl leading-[41.6px] lg:text-[56px] lg:leading-[66.08px] lg:tracking-[-1px] font-medium lg:font-normal w-full lg:w-[732px]"
              {...defaultRevealY}
            >
              Our Approach
            </motion.h2>
            <motion.p
              className="text-lg tracking-wide w-full lg:w-[440px] mt-6 lg:mt-0"
              {...defaultRevealY}
              transition={{ ...transitionVariants, delay: 0.3 }}
            >
              <span className="text-custom-secondary">The 3-Step Process:</span>{" "}
              This is how you go from &quot;someone at the mercy of local energy
              infrastructure&quot; to becoming Energy Independent.
            </motion.p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-[60px]">
            {servicesCards.map((card, index) => (
              <div className="bg-white flex flex-col" key={index}>
                <motion.div
                  {...defaultRevealY}
                  transition={{ ...transitionVariants, delay: index * 0.15 }}
                  className="flex flex-col px-4 lg:px-6 py-10 lg:pb-[50px] grow"
                >
                  <div className="text-xs text-custom-black font-medium border border-neutral-300 p-2 w-fit tracking-widest">
                    · STEP {index + 1}
                  </div>
                  <p className="text-3xl text-custom-black font-medium mt-3">
                    {card.title}
                  </p>
                  <p className="text-base text-neutral-500 mt-3 w-full lg:w-[373.3px]">
                    {card.description}
                  </p>
                </motion.div>
                <Image
                  src={`/images/service-${index + 1}.webp`}
                  alt={`service card ${index + 1}`}
                  width={440}
                  height={440}
                  className="w-full h-auto lg:w-auto lg:h-[440px] shrink-0 lg:shrink"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* faq section */}
      <div className="bg-custom-primary text-white bg-[url('/images/panels-inverted.png')] bg-[length:548px_auto] lg:bg-[length:922px_auto] bg-no-repeat bg-top lg:bg-[position:-63px_31%] max-2xl:bg-[position:calc(50%-300px)_300px]">
        <div className="lg:flex lg:flex-row lg:justify-between lg:items-end max-w-7xl mx-auto pt-[108px] lg:pt-[100px] pl-4 lg:pl-0 relative">
          <Image
            src="/images/faq.png"
            alt="faq bg"
            width={385}
            height={829}
            className="absolute lg:static z-0 bottom-[48px] left-0 right-0 w-full h-auto lg:h-[826px]"
          />
          <div className="flex flex-col grow bg-white text-custom-black px-4 py-6 lg:py-[100px] lg:pr-10 lg:pl-[116px] relative z-10">
            <div className="text-xs font-medium border border-neutral-300 py-2 px-4 w-fit tracking-[0.06em]">
              04 · QUESTIONS
            </div>
            <motion.h2
              className="text-4xl leading-[41.6px] lg:text-[56px] lg:leading-[66.08px] lg:tracking-[-1px] font-medium lg:font-normal mt-4 w-full lg:w-[456px]"
              {...defaultRevealY}
            >
              Frequently Asked Questions
            </motion.h2>
            <div className="mt-[60px] lg:mt-[48px] lg:w-[900px]">
              <Accordion items={faqItems} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
