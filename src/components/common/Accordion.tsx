'use client';
import { useState } from 'react';
import { AccordionProps } from '@/types';
import { ACCORDION_ICONS, ICON_PROPS_TEXT } from '@/constants/accordion';
import { motion } from 'framer-motion';
import { cn } from "@/lib/utils";

export default function Accordion({ items, icon = 'plus' }: AccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleClick = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const renderIcon = (isOpen: boolean) => {
    if (icon === ICON_PROPS_TEXT.PLUS) {
      return isOpen ? ACCORDION_ICONS.plus : ACCORDION_ICONS.minus;
    }
    return ACCORDION_ICONS.chevron;
  };

  return (
    <div className="flex flex-col gap-4">
      {items.map((item, index) => (
        <div key={index} className="border-b border-neutral-300">
          <button
            className="w-full flex justify-between items-center py-6 text-left"
            onClick={() => handleClick(index)}
          >
            <span className="text-xl font-medium">{item.title}</span>
            <span className={cn('accordion-icon transition-transform duration-200 ml-[13px]', {
              'rotate-180': icon === ICON_PROPS_TEXT.CHEVRON && openIndex === index,
            })}>
              {renderIcon(openIndex === index)}
            </span>
          </button>
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: openIndex === index ? 'auto' : 0, opacity: openIndex === index ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pb-6 pr-6 lg:pr-[60px] text-[#707476]">
              {item.content}
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  );
}
