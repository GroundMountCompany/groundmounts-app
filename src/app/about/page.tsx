"use client";

import { ABOUT_CARDS } from "@/constants/about";
import { AboutCard } from "@/types";
import Image from "next/image";
import Link from "next/link";
import ZipcodeInput from "@/components/common/ZipcodeInput";
import { motion } from "framer-motion";
import {
  defaultRevealY,
  defaultInitialRevealX,
  defaultInitialRevealY,
} from "@/constants/animation";

export default function About() {
  const aboutCards: AboutCard[] = ABOUT_CARDS;

  return (
    <main className="bg-white">
      {/* hero section */}
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row px-4 pt-[64px] lg:py-0 lg:px-10 lg:justify-between lg:items-center">
        <div className="flex flex-col w-full lg:w-[40%]">
          <div className="flex flex-row items-center text-xs font-medium tracking-widest w-fit border border-neutral-300 px-4 py-2">
            <Image
              src="/images/icons/about-pill-icon.svg"
              alt="About Us"
              width={20}
              height={20}
            />
            <div className="ml-3">ABOUT US</div>
          </div>
          <motion.h1
            {...defaultInitialRevealX}
            className="text-[44px] lg:text-[62px] leading-[51.92px] lg:leading-[73.16px] tracking-[-1px] mt-10 text-neutral-600"
          >
            Our Specialization Advantage
          </motion.h1>
        </div>
        <div className="w-[calc(100% + 32px)] h-[500px] lg:w-[595px] lg:h-[716px] mt-[64px] lg:mt-0 mx-[-16px] lg:mx-0 relative bg-blue-100 overflow-hidden flex flex-col justify-end px-4 lg:px-10 py-10 lg:py-0 lg:pb-[60px] lg:-right-10">
          <Image
            src="/images/about-hero.webp"
            alt="hero image"
            width={736}
            height={356}
            className="hidden lg:block absolute right-0 top-4"
          />
          <Image
            src="/images/about-hero-mobile.png"
            alt="hero image"
            width={356}
            height={356}
            className="block lg:hidden absolute right-0 top-0"
          />
          <div className="relative">
            <Image
              src="/images/icons/mark.webp"
              alt="mark icon"
              width={75}
              height={78}
              className="w-[75px] h-[78px] absolute left-[45px] bottom-8 lg:top-[-60px] lg:left-5 z-0"
            />
            <motion.p
              {...defaultInitialRevealY}
              transition={{ delay: 0.5 }}
              className="text-2xl lg:text-3xl lg:font-medium text-neutral-700 leading-[41.6px] z-10 relative"
            >
              I fear not the man who has practiced 10,000 kicks once, but I fear
              the man who has practiced one kick 10,000 times.
            </motion.p>
            <div className="text-base text-neutral-500 leading-[26px] mt-6 flex flex-row items-center">
              <Image
                src="/images/about-reviewer.webp"
                alt="reviewer image"
                width={46}
                height={46}
              />
              <div className="ml-3">
                <motion.div
                  {...defaultInitialRevealY}
                  transition={{ delay: 0.7 }}
                  className="text-lg font-medium text-[#1F1D1D]"
                >
                  Andi Markwiens
                </motion.div>
                <motion.div
                  {...defaultInitialRevealY}
                  transition={{ delay: 0.9 }}
                  className="text-base text-[#1F1D1D]"
                >
                  Entrepreneur
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Image
        src="/images/about-1.png"
        alt="hero divider image"
        width={1440}
        height={500}
        className="hidden lg:block w-full"
      />
      <Image
        src="/images/about-1-mobile.png"
        alt="hero divider image"
        width={0}
        height={0}
        sizes="100vw"
        className="block w-full h-[500px] lg:hidden object-cover"
        style={{width: '100%'}}
      />
      {/* cost of roof section */}
      <div className="max-w-7xl mx-auto lg:px-10">
        <div className="border-b border-neutral-300 flex flex-col px-4 py-[64px] lg:pb-[80px] lg:px-0 lg:pt-[100px]">
          <div className="text-xs font-medium border border-neutral-300 py-2 px-4 w-fit tracking-[0.06em]">
            02 · SOLAR INSTALLATION
          </div>
          <motion.h2
            {...defaultRevealY}
            className="text-4xl leading-[41px] lg:text-[56px] lg:leading-[66px] lg:tracking-tighter font-medium lg:font-normal mt-4 w-full lg:w-[60%]"
          >
            According to
            <span
              className="text-custom-secondary font-black text-white mx-2 font-serif"
              style={{ WebkitTextStroke: "1px #002868" }}
            >
              Forbes
            </span>
            , as of July 2024, there are 261 solar installation companies in
            Texas.{" "}
          </motion.h2>
        </div>
      </div>
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start px-4 py-[64px] lg:px-10 lg:py-[80px]">
        <motion.h3
          {...defaultRevealY}
          className="text-4xl leading-[41px] lg:tracking-tighter font-medium w-full lg:w-[555px]"
        >
          We are the ONLY one that will never drill a hole on a roof.
        </motion.h3>
        <motion.p
          {...defaultRevealY}
          className="text-lg mt-[18px] lg:mt-0 w-full lg:w-[514px] text-[#707476]"
        >
          We built this company from the ground up to be the ultimate ground
          mount installation machine. This means that aside from our licensed
          electricians, we also have skilled machine operators, concrete
          workers, and aren&apos;t allergic to shovels.
        </motion.p>
      </div>
      <Image
        src="/images/about-2.webp"
        alt="hero divider image"
        width={1440}
        height={500}
        className="hidden lg:block w-full"
      />
      <Image
        src="/images/about-2-mobile.png"
        alt="hero divider image"
        width={0}
        height={0}
        sizes="100vw"
        className="block w-full h-[500px] lg:hidden object-cover"
        style={{width: '100%'}}
      />
      <div className="border-b border-neutral-300">
        <div className="max-w-7xl mx-auto flex flex-col justify-between items-start px-4 py-[64px] lg:px-10 lg:pt-[80px] lg:pb-[100px]">
          <div className="flex flex-col lg:flex-row lg:justify-between">
            <motion.div
              {...defaultRevealY}
              className="flex flex-col lg:flex-row items-start w-full lg:w-[50%]"
            >
              <Image
                src="/images/texts/01.svg"
                alt="01"
                width={67}
                height={56}
                className="leading-[1]"
              />
              <div className="flex flex-col grow mt-[51px] lg:mt-0 lg:ml-[51px]">
                <p className="text-lg font-medium text-[#707476]">
                  We are the ONLY one that will never drill a hole on a roof.
                </p>
                <p className="text-4xl leading-[41px] lg:text-[56px] lg:leading-[66px] lg:tracking-[0.5px] font-medium lg:font-normal mt-4">
                  Ugh, Just Put It on Your Roof&rdquo; Price.
                </p>
              </div>
            </motion.div>
            <motion.div
              {...defaultRevealY}
              transition={{ delay: 0.5 }}
              className="flex flex-col lg:flex-row items-start w-full lg:w-[50%] mt-[64px] lg:mt-[110px]"
            >
              <Image
                src="/images/texts/02.svg"
                alt="02"
                width={78}
                height={57}
                className="leading-[1]"
              />
              <div className="flex flex-col grow mt-[51px] lg:mt-0 lg:ml-[51px]">
                <p className="text-lg font-medium text-[#707476]">
                  We will give you the
                </p>
                <p className="text-4xl leading-[41px] lg:text-[56px] lg:leading-[66px] lg:tracking-[0.5px] font-medium lg:font-normal mt-4">
                  We Are Specialized For This&rdquo; Price.
                </p>
              </div>
            </motion.div>
          </div>
          <p className="text-sm w-full lg:w-[734px] lg:mx-auto bg-[#E9EAEB80] p-2 pr-4 mt-[80px]">
            And that specialization is what allows us to be the best at what we
            do so much so, that Bruce Lee might fear us.
          </p>
        </div>
      </div>
      <div className="border-b border-neutral-300">
        <div className="max-w-7xl mx-auto flex flex-col justify-between items-center px-4 py-[64px] lg:px-10 lg:pt-[80px] lg:pb-[100px]">
          <div className="flex flex-col items-center">
            <div className="text-xs font-medium border border-neutral-300 py-2 px-4 w-fit tracking-[0.06em]">
              03 · FREE QUOTE
            </div>
            <motion.h2
              {...defaultRevealY}
              className="text-4xl leading-[41px] lg:text-[56px] lg:leading-[66px] lg:tracking-[0.5px] font-medium lg:font-normal w-full lg:w-[550px] text-center mt-4"
            >
              The Right To Protect Your Home
            </motion.h2>
            <motion.p
              {...defaultRevealY}
              className="text-lg tracking-wide w-full lg:w-[550px] text-center mt-8 text-[#707476]"
            >
              We believe that every Texas homeowner has the right to protect
              their home from unreliable, local energy infrastructure.
            </motion.p>
          </div>
          <div className="flex flex-col lg:flex-row items-center w-full mt-[80px]">
            <div className="flex flex-col items-start w-full lg:w-[555px] bg-custom-primary pt-[60px] px-4 lg:px-[32px] pb-[40px]">
              <div className="w-[48px] h-[48px] flex items-center justify-center bg-white rounded-full">
                <Image
                  src="/images/icons/lightning.webp"
                  alt="about image"
                  width={16}
                  height={22}
                  className="w-[16px] h-[22px]"
                />
              </div>
              <motion.p
                {...defaultRevealY}
                className="text-2xl mt-4 text-white"
              >
                Electricity prices in Texas have increased
              </motion.p>
              <motion.p
                {...defaultRevealY}
                className="text-[100px] lg:text-[120px] leading-[1] tracking-[-1px] font-medium text-custom-secondary mt-[64px] lg:mt-[100px]"
              >
                4.66%
              </motion.p>
              <motion.p {...defaultRevealY} className="text-white mt-4">
                in the last 12 months (nearly double inflation)
              </motion.p>
              <motion.p
                {...defaultRevealY}
                className="text-sm mt-[64px] lg:mt-[100px] text-[#D3D4D6]"
              >
                *According to{" "}
                <Link
                  href="https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a"
                  target="_blank"
                  className="underline"
                >
                  data from the EIA
                </Link>
              </motion.p>
            </div>
            <div className="flex flex-col bg-neutral-200 lg:w-[calc(100%-555px)] px-4 py-[64px] lg:px-[80px] lg:py-[100px]">
              <motion.p {...defaultRevealY} className="text-2xl">
                Over the next 20 years, the average Texas household could
                potentially save $74,700 by switching to solar energy.
              </motion.p>
              <motion.p
                {...defaultRevealY}
                className="text-lg mt-5 text-[#707476]"
              >
                It&apos;s time to regain your independence.
              </motion.p>
              <ZipcodeInput
                className="flex flex-row items-center lg:justify-between mt-10 bg-white rounded-full p-2 pl-6 shadow-md border border-neutral-200 w-full lg:w-full"
                inputClassName="w-1/2 lg:w-auto shrink grow-0 lg:shrink-0 lg:grow outline-none pr-2 text-base lg:text-lg text-neutral-500"
                buttonClassName="text-sm lg:text-base !font-semibold"
              />
            </div>
          </div>
        </div>
      </div>
      {/* services section */}
      <div className="border-b border-white/20 bg-custom-primary text-white">
        <div className="max-w-7xl mx-auto flex flex-col px-4 py-[64px] lg:px-10 lg:py-[100px] items-center">
          <div className="flex flex-col items-center">
            <div className="text-xs font-medium border border-[#214A8B] py-2 px-4 w-fit tracking-[0.06em]">
              04 · RISK FREE
            </div>
            <motion.h2
              {...defaultRevealY}
              className="text-4xl leading-[41px] lg:text-[56px] lg:leading-[66px] lg:tracking-[0.5px] font-medium lg:font-normal w-full lg:w-[912px] text-center mt-4"
            >
              We Exist So You Can Be Energy Independent Completely Risk-Free
            </motion.h2>
            <motion.p
              {...defaultRevealY}
              className="text-lg tracking-wide w-full lg:w-[586px] text-center mt-8"
            >
              With over 20 years of Solar Energy experience, we&apos;ve encountered
              homes ruined by roof-mounted solar panels. We&apos;ve seen roofs:
            </motion.p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-[60px]">
            {aboutCards.map((card, index) => (
              <div className="bg-white flex flex-col" key={index}>
                <div className="flex flex-col px-4 lg:px-5 pt-8 pb-6 grow">
                  <div className="bg-neutral-200 flex items-center justify-center w-[80px] h-[80px]">
                    <Image
                      src={`/images/icons/about-card-icon-${index + 1}.webp`}
                      alt={`about card icon ${index + 1}`}
                      width={36}
                      height={36}
                    />
                  </div>
                  <motion.div
                    {...defaultRevealY}
                    className="text-2xl text-custom-black mt-6"
                  >
                    {card.title}
                  </motion.div>
                </div>
                <div>
                  <Image
                    src={`/images/about-card-img-${index + 1}.png`}
                    alt={`about card image ${index + 1}`}
                    width={440}
                    height={320}
                    className="h-[320px] lg:h-auto lg:w-full object-cover object-center lg:object-fill"
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-lg font-medium text-white mt-8 text-center w-full lg:w-[586px]">
            *And the worst part—when these avoidable emergencies happen,
            insurance companies refuse to help.
          </p>
        </div>
      </div>
      {/* right choice section */}
      <div className="border-b border-white/20 bg-custom-primary text-white">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row px-4 py-[64px] lg:px-10 lg:py-[100px] justify-between">
          <div className="flex flex-col w-full lg:w-[532px]">
            <div className="text-xs font-medium border border-[#214A8B] py-2 px-4 w-fit tracking-[0.06em]">
              05 · RIGHT CHOICE
            </div>
            <motion.h2
              {...defaultRevealY}
              className="text-4xl leading-[41px] lg:text-[56px] lg:leading-[66px] lg:tracking-[0.5px] font-medium lg:font-normal w-full lg:w-[532px] mt-4"
            >
              Your Family&apos;s Safety Comes First
            </motion.h2>
            <motion.p
              {...defaultRevealY}
              className="text-lg tracking-wide w-full lg:w-[532px] mt-8"
            >
              Does this sound familiar ?
            </motion.p>
          </div>
          <div className="flex flex-col w-full mt-[64px] lg:mt-[193px] lg:w-[710px] lg:relative lg:right-[-40px]">
            <div className="bg-custom-secondary lg:w-full pb-[170px] lg:pb-0 relative overflow-hidden">
              <Image src="/images/about-5-vector.png" alt="about family safety" width={335.92} height={273.56} className="absolute top-25.19 right-[-82.01px] hidden lg:block" />
              <Image src="/images/about-5-vector-mobile.png" alt="about family safety" width={335.92} height={273.56} className="absolute bottom-[0px] left-[4px] block lg:hidden" />
              <div className="w-full lg:w-[460px] z-10 relative">

                <Image
                  src="/images/about-5.png"

                  alt="about family safety"
                  width={460}
                  height={343}
                  className="h-[343px] lg:h-auto lg:w-full object-cover object-center lg:object-fill"
                />
              </div>
            </div>
            <motion.p {...defaultRevealY} className="text-lg mt-[60px]">
              A severe storm plows through Texas and now you&apos;re without
              power for days—usually during life-threatening scorching heat
              waves or artic cold spikes. When you need your energy to protect
              your family from the elements the most, you&apos;re left stranded.
              All of the data shows there&apos;s no end in sight.
            </motion.p>
            <motion.p {...defaultRevealY} className="text-2xl mt-6">
              You need an energy solution that keeps your family safe when
              they&apos;re most at-risk.
            </motion.p>
          </div>
        </div>
      </div>
    </main>
  );
}
