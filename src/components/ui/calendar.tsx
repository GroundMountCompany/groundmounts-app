"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { JSX } from "react"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  ...props
}: CalendarProps): JSX.Element {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full",
        month: "space-y-4 w-full",
        caption: "flex justify-between pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "",
        nav_button_next: "",
        table: "w-full border-collapse space-y-1",
        head_row: "flex justify-between",
        head_cell:
          "text-neutral-500 rounded-md w-[26px] font-normal text-[0.8rem]",
        row: "flex justify-between mt-1",
        cell: "h-[26px] w-[26px] text-center text-xs p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-neutral-100/50 [&:has([aria-selected])]:bg-neutral-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-[26px] w-[26px] p-0 font-normal aria-selected:opacity-100 bg-[#638ED233] text-custom-primary hover:bg-custom-primary hover:text-white"
        ),
        day_range_end: "day-range-end",
        day_today: "",
        day_selected:
          "!bg-custom-primary text-white hover:bg-custom-primary-light hover:text-white focus:bg-custom-primary-light focus:text-white",
        day_outside:
          "day-outside text-neutral-500 aria-selected:bg-neutral-100/50 aria-selected:text-neutral-500",
        day_disabled: "text-neutral-500 opacity-50 !bg-white",
        day_range_middle:
          "aria-selected:bg-neutral-100 aria-selected:text-neutral-900",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }: { className?: string }): JSX.Element => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }: { className?: string }): JSX.Element => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
