import { cn } from '@/lib/utils';
import React, { JSX, useState, useCallback, useEffect, useRef } from 'react';

// Tambahkan tipe untuk props
interface TimePickerProps {
  format: '12-hour' | '24-hour'
  selectedTime: string
  setSelectedTime: (time: string) => void
}

export default function TimePicker({ selectedTime, setSelectedTime, format }: TimePickerProps): JSX.Element {
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const timePickerRef = useRef<HTMLDivElement>(null);

  // Fungsi untuk menghasilkan waktu dalam format yang dipilih
  const generateTimeOptions = useCallback((): string[] => {
    const times: string[] = [];
    const is12HourFormat = format === '12-hour';
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        let displayHour = hour;
        let period = '';

        if (is12HourFormat) {
          period = hour < 12 ? 'AM' : 'PM';
          displayHour = hour % 12 || 12; // Konversi 0 ke 12 untuk format 12 jam
        }

        const time = `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${is12HourFormat ? ` ${period}` : ''}`;
        times.push(time);
      }
    }
    return times;
  }, [format]);

  const handleSelectTime = useCallback((time: string) => {
    setSelectedTime(time);
    setIsDropdownOpen(false);
  }, [setSelectedTime, setIsDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="flex flex-row gap-[7px] items-center">
      <label htmlFor="custom-time-picker" className="text-sm">Time :</label>
      <div className="relative" ref={timePickerRef}>
        <div
          id="custom-time-picker"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="text-xs border border-neutral-300 rounded-[5px] p-2 outline-none leading-[18px] tracking-[0.06em] text-center w-[84px] cursor-pointer"
        >
          {selectedTime}
        </div>
        {isDropdownOpen && (
          <div className="absolute z-10 bg-white border border-neutral-300 rounded-[5px] mt-1 w-full max-h-60 overflow-y-auto text-center">
            {generateTimeOptions().map((time) => (
              <div
                key={time}
                onClick={() => handleSelectTime(time)}
                className={cn("p-2 hover:bg-neutral-300 cursor-pointer text-xs", selectedTime === time ? 'bg-neutral-300' : '')}
              >
                {time}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
