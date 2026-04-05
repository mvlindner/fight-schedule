"use client";

import { useEffect, useRef, useState } from "react";
import { TIMEZONE_OPTIONS, type TimezoneOption } from "@/lib/time";

type Props = {
  value: TimezoneOption;
  onChange: (timezone: TimezoneOption) => void;
  triggerClassName?: string;
};

export default function TimezoneSelector({ value, onChange, triggerClassName }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      const target = event.target as Node | null;
      if (!root || !target || root.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleSelect = (option: TimezoneOption) => {
    onChange(option);
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative text-inherit">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={triggerClassName ?? "text-sm leading-none opacity-60 hover:opacity-100 transition-opacity duration-150 cursor-pointer"}
        aria-label="Select timezone"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {value}
      </button>

      <div
        className={`absolute right-0 top-full z-10 mt-2 rounded-xl border border-neutral-200 bg-white p-1.5 backdrop-blur-sm transition-all duration-150 dark:border-white/10 dark:bg-neutral-900 ${
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        <ul role="listbox" aria-label="Timezone options">
          {TIMEZONE_OPTIONS.map((option) => {
            const isActive = option === value;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(option)}
                  className={`block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 ${
                    isActive
                      ? "relative pl-2.5 font-medium text-violet-700 before:absolute before:left-0 before:top-1/2 before:h-[60%] before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-violet-500/20 dark:text-red-300 dark:before:bg-red-400/20"
                      : "text-neutral-700 dark:text-neutral-300"
                  } hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-red-500/10 dark:hover:text-red-300`}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
