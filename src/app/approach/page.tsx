/* eslint react-hooks/rules-of-hooks: warn */
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { debounce, cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { approachSteps } from "@/constants/approach";
import { defaultRevealY, defaultInitialRevealY } from "@/constants/animation";
import ZipcodeInput from "@/components/common/ZipcodeInput";

export default function ApproachPage() {
  const [isSticky, setIsSticky] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const heroSectionRef = useRef<HTMLDivElement | null>(null);
  const quoteSectionRef = useRef<HTMLDivElement | null>(null);
  const stepRef = Array.from({ length: approachSteps.length }, () => useRef<HTMLDivElement | null>(null));

  const handleScroll = useCallback(() => {
    if (heroSectionRef.current) {
      const heroBottom = heroSectionRef.current.getBoundingClientRect().bottom;

      // stickySnappingPoint is used to determine the snapping point to make the step link section sticky
      // -100 is sweet spot when the step link section just exit the viewport
      const stickySnappingPoint = -100;
      setIsSticky(heroBottom <= stickySnappingPoint);
      if (heroBottom > stickySnappingPoint) {
        setActiveStep(0);
      }
    }

    const scrollPosition = window.scrollY;

    // activeStepSnappingPointTolerance is used to add some snapping point tolerance to active section.
    // So that it will trigger when we are about to scroll into the active section
    const activeStepSnappingPointTolerance = {
      top: 100,
      bottom: 100,
    };
    stepRef.forEach((step, index) => {
      if (step.current) {
        const elementTop = step.current.getBoundingClientRect().top + scrollPosition;
        const elementBottom = elementTop + step.current.clientHeight;
        if (scrollPosition >= elementTop - activeStepSnappingPointTolerance.top && scrollPosition <= elementBottom + activeStepSnappingPointTolerance.bottom) {
          setActiveStep(index + 1);
        }
      }
    });

    // hide sticky section when user scrolled past step section
    if (quoteSectionRef.current) {
      const quoteSectionTop = quoteSectionRef.current?.getBoundingClientRect().top + scrollPosition - 250;
      if (quoteSectionTop <= scrollPosition) {
        setIsSticky(false);
      }
    }
  }, [heroSectionRef, quoteSectionRef, stepRef]);

  // to avoid scroll event trigger in every pixel scroll event. i give 50ms timeout to trigger scroll event
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedHandleScroll = useCallback(debounce(handleScroll, 50), []);

  useEffect(() => {
    window.addEventListener('scroll', debouncedHandleScroll);

    // to trigger scroll event when page load
    handleScroll();
    return () => window.removeEventListener('scroll', debouncedHandleScroll);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, stepId: number) => {
    e.preventDefault();
    const element = document.getElementById(`step-${stepId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveStep(stepId);
    }
  };

  return (
    <main className="bg-white">
      <div
        ref={heroSectionRef}
        className="bg-[url('/images/our-service-hero.jpg')] relative bg-cover bg-center h-[700px] lg:h-[600px] w-full flex items-center justify-center before:content-[''] before:absolute before:top-0 before:left-0 before:w-full before:h-full before:bg-black before:opacity-45 z-0"
      >
        <div className="flex flex-col items-center text-center w-full lg:w-[900px] px-4 z-20 relative">
          <div className="flex flex-row items-center text-xs font-medium tracking-widest w-fit border border-neutral-300 px-4 py-2 bg-white shadow-lg">
            <Image src="/images/icons/hand.png" alt="hand icon" width={20} height={20} />
            <div className="ml-3">OUR APPROACH</div>
          </div>
          <motion.h1
            {...defaultInitialRevealY}
            className="text-[44px] lg:text-[62px] font-medium font-normal leading-[51.92px] lg:leading-[73.16px] mt-10 tracking-[-1px] text-white text-shadow-lg"
          >
            We Do Everything.<br />
            You Do Nothing.
          </motion.h1>
          <motion.p {...defaultRevealY} transition={{ delay: 0.5 }} className="font-medium text-lg text-neutral-200 mt-8 text-white text-shadow-lg">
            Here&apos;s a full overview of everything
          </motion.p>
        </div>
      </div>
      <div className={cn("flex items-center justify-center overflow-x-scroll lg:overflow-x-hidden w-full lg:w-auto py-0 lg:py-8", { 'h-[92px] lg:h-[157px]' : isSticky })}>
        <div className={cn("flex flex-row items-center justify-start lg:justify-center p-5 transition-transform duration-300 ease-in-out",
          {
            'fixed overflow-x-auto transform -translate-y-5 lg:-translate-y-10 bottom-0 w-full lg:w-[1072px] left-2 right-auto lg:left-auto lg:right-auto bg-white py-4 shadow-xl rounded-full z-20' : isSticky,
            'lg:w-[1072px] w-full' : !isSticky
          })}>
          {approachSteps.map((step, index) => (
            <Link
              key={index}
              href={`#step-${step.step}`}
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => scrollToSection(e, step.step)}
              className={cn("font-medium border rounded-full ml-8 first:ml-0 w-[120px] h-[52px] flex grow basis-[120px] shrink-0 items-center justify-center bg-white relative",
                "first:before:hidden before:content-[''] before:absolute before:top-[calc(50% - 1px)] before:-left-8 before:w-[32px] before:h-[1px] before:z-0",
                "transition-all duration-300 ease-in-out hover:bg-neutral-200",
                {
                  'border-custom-primary text-custom-primary before:bg-custom-primary' : step.step <= activeStep,
                  'text-neutral-400 border-neutral-300 before:bg-neutral-300' : step.step > activeStep
                })}
            >
              Step {step.step}
            </Link>
          ))}
        </div>
      </div>
      {approachSteps.map((step, index) => {
        const isEven = step.step%2 === 0;
        return (
          <div
            ref={stepRef[index]}
            key={index}
            id={`step-${step.step}`}
            className="max-w-7xl mx-auto px-4 lg:px-10">
            <div className={cn("flex flex-col items-center justify-center last:border-b-0 border-t border-neutral-300  py-[80px]",
              {
                'lg:flex-row-reverse' : isEven,
                'lg:flex-row' : !isEven
              })}
            >
              <div className="flex flex-col items-start justify-center w-full lg:w-[675px]">
                <div className="text-xs font-medium border border-neutral-300 p-2 w-fit tracking-widest">
                  · STEP {step.step}
                </div>
                <motion.h2 {...defaultRevealY} className="text-4xl leading-[41.6px] lg:text-[56px] lg:leading-[66px] lg:tracking-[-1px] font-medium lg:font-normal w-full lg:w-[615px] mt-4 lg:mt-6">
                  {step.title}
                </motion.h2>
                <motion.p {...defaultRevealY} className="text-2xl w-full mt-6 lg:mt-10 text-neutral-500">
                  {step.description}
                </motion.p>
                <motion.p {...defaultRevealY} className="text-lg w-full mt-6 text-neutral-400">
                  {step.additionalDescription}
                </motion.p>
                <motion.div {...defaultRevealY} className="text-sm mt-6 lg:mt-10 flex flex-row items-start justify-start py-2 pl-2 pr-4 bg-neutral-200">
                  <Image src="/images/icons/clock.png" alt="clock icon" width={20} height={20} className="mr-2" />
                  <div className="flex flex-row items-start justify-start flex-wrap lg:flex-nowrap">
                    <span className="text-neutral-400 shrink-0 grow-0 basis-auto mr-2">Estimated Time:</span>
                    <p className="font-medium text-custom-black">{step.estimatedTime}</p>
                  </div>
                </motion.div>
              </div>
              <div className={cn("flex flex-row items-center justify-center mt-10 lg:mt-0", {
                  'flex-row-reverse lg:mr-10' : isEven,
                  'flex-row lg:ml-10' : !isEven
                })}>
                <Image src={`/images/step-${step.step}.png`} alt={`step ${step.step}`} width={440} height={553} className="w-auto h-[282px] lg:h-[553px]"/>
                <div className={cn("w-[107.1px] h-[282px] lg:w-[210px] lg:h-[553px] relative overflow-hidden",
                  {
                    'bg-custom-secondary mr-5' : isEven,
                    'bg-custom-primary ml-5' : !isEven,
                  })}>
                    {step.decorationImage ? <Image src={step.decorationImage} alt={`decorationstep ${step.step}`} fill style={{objectFit: 'contain'}} className={step.decorationImagePosition} /> : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div className="bg-custom-primary border-b border-white/20 overflow-hidden" ref={quoteSectionRef}>
        <div className="max-w-7xl mx-auto w-full relative flex justify-center px-4 lg:px-0 overflow-visible">
          <Image src="/images/service-quote-right.png" alt="panels" width={788.91} height={381.48} className="absolute lg:top-[-127.79px] lg:right-[-360px] z-0"/>
          <Image src="/images/service-quote-left.png" alt="panels" width={441.61} height={424.3} className="absolute bottom-[-82px] lg:left-[-81px] z-0"/>
          <div className="w-full lg:w-[673px] flex flex-col items-center justify-center py-[142px] relative z-10">
            <motion.h2 {...defaultRevealY} className="text-4xl lg:text-[56px] lg:leading-[66.08px] lg:tracking-[-1px] text-white text-center">Get A Free Quote In 3 Minutes</motion.h2>
            <ZipcodeInput className="mt-4"/>
          </div>
        </div>
      </div>
    </main>
  );
}
