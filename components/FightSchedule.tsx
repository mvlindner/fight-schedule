"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FightList from "@/components/FightList";
import ThemeToggle from "@/components/ThemeToggle";
import TimezoneSelector from "@/components/TimezoneSelector";
import ImprintContent from "@/components/legal/ImprintContent";
import PrivacyContent from "@/components/legal/PrivacyContent";
import {
  getNow,
  getHighlightedFights,
  getLocalDateKey,
  getUtcDateTime,
  type Fight,
  type TimezoneOption,
} from "@/lib/time";

type Props = {
  fights: Fight[];
};

type LegalModal = "imprint" | "privacy" | null;
const LEGAL_MODAL_CLOSE_MS = 450;

const STORAGE_KEY = "user-timezone";
const IANA_BY_TIMEZONE: Record<TimezoneOption, string> = {
  UTC: "UTC",
  CET: "Europe/Berlin",
  EST: "America/New_York",
  PST: "America/Los_Angeles",
};
const TIMELINE_DAY_ANIMATION_MS = 950;

function getDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

function toTimezoneOption(timeZone: string): TimezoneOption {
  switch (timeZone) {
    case "UTC":
      return "UTC";
    case "Europe/Berlin":
    case "Europe/Vienna":
    case "Europe/Paris":
    case "Europe/Rome":
    case "Europe/Madrid":
      return "CET";
    case "America/New_York":
    case "America/Toronto":
    case "America/Detroit":
    case "America/Montreal":
      return "EST";
    case "America/Los_Angeles":
    case "America/Vancouver":
      return "PST";
    default:
      if (timeZone.startsWith("Europe/")) {
        return "CET";
      }
      if (timeZone.startsWith("America/New_York") || timeZone.startsWith("America/Toronto")) {
        return "EST";
      }
      if (
        timeZone.startsWith("America/Los_Angeles") ||
        timeZone.startsWith("America/Vancouver")
      ) {
        return "PST";
      }
      return "UTC";
  }
}

function getPreferredTimezone(): TimezoneOption {
  const savedTimezone = localStorage.getItem(STORAGE_KEY);
  if (
    savedTimezone === "UTC" ||
    savedTimezone === "CET" ||
    savedTimezone === "EST" ||
    savedTimezone === "PST"
  ) {
    return savedTimezone;
  }

  return toTimezoneOption(getDetectedTimezone());
}

function formatClock(timezone: TimezoneOption, now: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IANA_BY_TIMEZONE[timezone],
  }).format(new Date(now));
}

function getCurrentUtcDateLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
}

export default function FightSchedule({ fights }: Props) {
  const hasAppliedInitialFocusRef = useRef(false);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const isInfoOpenRef = useRef(false);
  const [isHeaderDimmed, setIsHeaderDimmed] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [activeFightId, setActiveFightId] = useState<string | null>(null);
  const [isTimezoneReady, setIsTimezoneReady] = useState(false);
  const [legalModal, setLegalModal] = useState<LegalModal>(null);
  const [isLegalModalClosing, setIsLegalModalClosing] = useState(false);
  const [animatedTimelineDayKeys, setAnimatedTimelineDayKeys] = useState<string[]>([]);
  const timelineAnimationTimeoutRef = useRef<number | null>(null);

  const [timezone, setTimezone] = useState<TimezoneOption>("UTC");

  const handleTimezoneChange = (nextTimezone: TimezoneOption) => {
    const currentDayKeys = new Set(
      fights.map((fight) => getLocalDateKey(fight.date, fight.time_utc, timezone)),
    );
    const nextDayKeys = new Set(
      fights.map((fight) => getLocalDateKey(fight.date, fight.time_utc, nextTimezone)),
    );
    const newDayKeys = Array.from(nextDayKeys).filter((dayKey) => !currentDayKeys.has(dayKey));

    if (timelineAnimationTimeoutRef.current) {
      window.clearTimeout(timelineAnimationTimeoutRef.current);
      timelineAnimationTimeoutRef.current = null;
    }

    if (newDayKeys.length > 0) {
      setAnimatedTimelineDayKeys(newDayKeys);
      timelineAnimationTimeoutRef.current = window.setTimeout(() => {
        setAnimatedTimelineDayKeys([]);
        timelineAnimationTimeoutRef.current = null;
      }, TIMELINE_DAY_ANIMATION_MS);
    } else {
      setAnimatedTimelineDayKeys([]);
    }

    setTimezone(nextTimezone);
    localStorage.setItem(STORAGE_KEY, nextTimezone);
  };

  const [now, setNow] = useState<number>(() => getNow().getTime());

  useEffect(() => {
    const nextTimezone = getPreferredTimezone();

    const frameId = window.requestAnimationFrame(() => {
      setTimezone(nextTimezone);
      setIsTimezoneReady(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timelineAnimationTimeoutRef.current) {
        window.clearTimeout(timelineAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(getNow().getTime());
    }, 60_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const clock = useMemo(() => {
    return formatClock(timezone, now);
  }, [timezone, now]);

  const groupedFights = useMemo(() => {
    const sorted = [...fights].sort(
      (a, b) =>
        getUtcDateTime(a.date, a.time_utc).toMillis() -
        getUtcDateTime(b.date, b.time_utc).toMillis(),
    );

    const byDate = new Map<string, Fight[]>();
    for (const fight of sorted) {
      const dateKey = getLocalDateKey(fight.date, fight.time_utc, timezone);
      const existing = byDate.get(dateKey) ?? [];
      existing.push(fight);
      byDate.set(dateKey, existing);
    }
    return Array.from(byDate.entries());
  }, [fights, timezone]);

  const loadingSkeletonGroups = useMemo(() => {
    const count = Math.min(8, Math.max(4, groupedFights.length || 0));
    return Array.from({ length: count }, (_, index) => index);
  }, [groupedFights.length]);

  const highlight = useMemo(() => {
    return getHighlightedFights(fights, timezone, new Date(now));
  }, [fights, timezone, now]);

  const highlightedIds = useMemo(() => {
    return new Set(highlight.ids);
  }, [highlight.ids]);

  const hasHighlightedState = highlight.type === "tonight" || highlight.type === "next";
  const privacyLastUpdated = useMemo(() => getCurrentUtcDateLabel(), []);

  useEffect(() => {
    const syncFadeState = () => {
      const scroller = document.scrollingElement ?? document.documentElement;
      const scrollTop = Math.max(0, scroller.scrollTop || window.scrollY || 0);
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const isScrolled = scrollTop > 0;
      const isAtBottom = maxScrollTop - scrollTop <= 4;

      if (isScrolled) {
        document.body.classList.remove("no-top-fade");
      } else {
        document.body.classList.add("no-top-fade");
      }

      if (isAtBottom) {
        document.body.classList.add("no-bottom-fade");
      } else {
        document.body.classList.remove("no-bottom-fade");
      }
    };

    syncFadeState();
    const frameId = window.requestAnimationFrame(syncFadeState);
    window.addEventListener("scroll", syncFadeState, { passive: true });
    window.addEventListener("resize", syncFadeState, { passive: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", syncFadeState);
      window.removeEventListener("resize", syncFadeState);
    };
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleHeaderOpacityOnScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 10) {
        setIsHeaderDimmed(false);
      } else if (currentScrollY > lastScrollY && currentScrollY > 40) {
        setIsHeaderDimmed(true);
      } else {
        setIsHeaderDimmed(false);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleHeaderOpacityOnScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleHeaderOpacityOnScroll);
    };
  }, []);

  const openInfo = useCallback(() => {
    document.body.classList.add("info-open");
    isInfoOpenRef.current = true;
    setIsInfoOpen(true);
  }, []);

  const closeInfo = useCallback(() => {
    document.body.classList.remove("info-open");
    isInfoOpenRef.current = false;
    setIsInfoOpen(false);
  }, []);

  const toggleInfo = useCallback(
    (event?: { stopPropagation: () => void }) => {
      event?.stopPropagation();
      if (isInfoOpenRef.current) {
        closeInfo();
      } else {
        openInfo();
      }
    },
    [closeInfo, openInfo],
  );

  useEffect(() => {
    // Ensure closed-by-default state on initial load.
    document.body.classList.remove("info-open");
    isInfoOpenRef.current = false;
    return () => {
      document.body.classList.remove("info-open");
      isInfoOpenRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!isInfoOpenRef.current) {
        return;
      }

      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const clickedInHeader = headerRef.current?.contains(target) ?? false;
      const clickedInInfoPanel = infoPanelRef.current?.contains(target) ?? false;

      if (!clickedInHeader && !clickedInInfoPanel) {
        closeInfo();
      }
    };

    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [closeInfo]);

  useEffect(() => {
    if (!hasHighlightedState) {
      return;
    }

    if (hasAppliedInitialFocusRef.current) {
      return;
    }

    const highlightedSection = document.querySelector<HTMLElement>(
      '[data-highlighted-section="true"]',
    );

    if (!highlightedSection) {
      return;
    }

    hasAppliedInitialFocusRef.current = true;

    highlightedSection.scrollIntoView({ block: "center" });
    window.scrollBy({
      top: Math.round(window.innerHeight * -0.12),
      left: 0,
      behavior: "auto",
    });
  }, [hasHighlightedState, groupedFights.length]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveFightId(null);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  useEffect(() => {
    if (!legalModal) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLegalModalClosing(true);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [legalModal]);

  useEffect(() => {
    if (!legalModal || !isLegalModalClosing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLegalModal(null);
      setIsLegalModalClosing(false);
    }, LEGAL_MODAL_CLOSE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [legalModal, isLegalModalClosing]);

  useEffect(() => {
    if (legalModal) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }

    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [legalModal]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".fight-item")) {
        setActiveFightId(null);
      }
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  const closeLegalModal = useCallback(() => {
    setIsLegalModalClosing(true);
  }, []);

  return (
    <section
      className={`timeline-container mx-auto min-h-screen px-6 py-20 text-left text-neutral-900 dark:text-neutral-100 ${
        activeFightId ? "has-active" : ""
      }`}
    >
      <header
        ref={headerRef}
        className={`header flex items-center justify-between ${isHeaderDimmed ? "header--dimmed" : ""}`}
      >
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-none text-neutral-900 dark:text-neutral-100">
          fight schedule
          <span
            className={`transition-colors duration-200 ${
              hasHighlightedState
                ? "text-violet-600 dark:text-red-400"
                : "text-neutral-900 dark:text-white"
            }`}
          >
            .
          </span>
        </h1>
        {isTimezoneReady ? (
          <div className="flex items-center gap-3 leading-none text-neutral-500 dark:text-neutral-400">
            <span
              className={`relative top-[1px] text-sm leading-none tracking-wide transition-colors duration-200 ${
                hasHighlightedState
                  ? "text-violet-600/60 dark:text-red-300/60"
                  : "text-neutral-600 dark:text-neutral-300 opacity-80"
              }`}
            >
              {clock}
            </span>
            <TimezoneSelector
              value={timezone}
              onChange={handleTimezoneChange}
              triggerClassName="header-control"
            />
            <ThemeToggle className="header-control" />
            <span
              className={`header-control info-trigger ${isInfoOpen ? "active" : ""}`}
              onClick={toggleInfo}
            >
              info
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 leading-none text-neutral-500 dark:text-neutral-400">
            <span className="relative top-[1px] text-sm leading-none tracking-wide text-violet-600/70 dark:text-red-300/70">
              {clock}
            </span>
            <span className="header-control pointer-events-none">UTC</span>
            <span className="header-control pointer-events-none">light</span>
            <span className="header-control pointer-events-none">info</span>
          </div>
        )}
      </header>

      <main className="content flex-1">
        <div
          ref={infoPanelRef}
          className={`info-panel ${isInfoOpen ? "open" : ""}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="info-header">
            <span
              className="info-close"
              onClick={(event) => {
                event.stopPropagation();
                closeInfo();
              }}
            >
              close
            </span>
          </div>
          <p>Fight Schedule is a free, non-commercial project.</p>
          <p>It helps you keep track of major fights so you don’t miss them.</p>
          <p>All times are shown in your local timezone.</p>
          <p>Times listed are estimated start times for the main event.</p>
          <p>Past fights remain on the timeline for 24 hours.</p>
          <br />
          <p>
            Buy me a coffee to support ongoing cost:{" "} 
            <a
              href="https://ko-fi.com/mvlindner"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-500 dark:text-red-300 hover:text-violet-700 dark:hover:text-red-400 transition-colors duration-150"
            >
              https://ko-fi.com/mvlindner
            </a>
          </p>
          <br />
        </div>

        {isTimezoneReady ? (
          <div className="timeline relative">
            <div className="absolute left-[6px] top-0 bottom-0 w-px bg-neutral-400/60 dark:bg-neutral-600/50" />

            <div className="pl-10">
              <FightList
                fights={fights}
                timezone={timezone}
                highlightType={highlight.type}
                highlightedIds={highlightedIds}
                activeFightId={activeFightId}
                setActiveFightId={setActiveFightId}
                animatedTimelineDayKeys={animatedTimelineDayKeys}
              />
            </div>
          </div>
        ) : (
          <div className="timeline relative">
            <div className="absolute left-[6px] top-0 bottom-0 w-px bg-neutral-400/60 dark:bg-neutral-600/50" />
            <div className="pl-10">
              <section className="space-y-24 animate-pulse min-h-[100vh]">
                {loadingSkeletonGroups.map((groupIndex) => {
                  const headerWidthClass =
                    groupIndex % 3 === 0 ? "w-48" : groupIndex % 3 === 1 ? "w-44" : "w-52";
                  const titleWidthClass =
                    groupIndex % 3 === 0 ? "w-[28rem]" : groupIndex % 3 === 1 ? "w-[26rem]" : "w-[24rem]";

                  return (
                    <div key={groupIndex} className="space-y-5">
                      <div
                        className={`h-3 ${headerWidthClass} rounded bg-neutral-300/40 dark:bg-neutral-700/40`}
                      />
                      <div className="flex items-baseline gap-2">
                        <div className="h-4 w-16 rounded bg-neutral-300/40 dark:bg-neutral-700/40" />
                        <div
                          className={`h-8 ${titleWidthClass} rounded bg-neutral-300/40 dark:bg-neutral-700/40`}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        )}
      </main>
      {isTimezoneReady ? (
        <footer className="pt-14 pb-6 text-center">
          <button
            type="button"
            onClick={() => {
              setLegalModal("imprint");
              setIsLegalModalClosing(false);
            }}
            className="text-xs tracking-wide text-neutral-500/60 dark:text-neutral-400/60 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors duration-150"
          >
            Imprint
          </button>
          <span className="mx-2 text-xs text-neutral-500/40 dark:text-neutral-400/40">•</span>
          <button
            type="button"
            onClick={() => {
              setLegalModal("privacy");
              setIsLegalModalClosing(false);
            }}
            className="text-xs tracking-wide text-neutral-500/60 dark:text-neutral-400/60 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors duration-150"
          >
            Privacy
          </button>
          <span className="mx-2 text-xs text-neutral-500/40 dark:text-neutral-400/40">•</span>
          <span className="text-xs tracking-wide text-neutral-500/60 dark:text-neutral-400/60">
            © 2026 Fight Schedule
          </span>
        </footer>
      ) : null}
      {legalModal ? (
        <div
          className={`fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-[4px] px-4 py-8 ${
            isLegalModalClosing ? "legal-overlay-exit" : "legal-overlay-enter"
          }`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLegalModal();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={legalModal === "imprint" ? "Imprint" : "Privacy Policy"}
        >
          <div
            className={`relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-neutral-200/70 bg-white/88 text-neutral-900 dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-100 backdrop-blur-md p-10 shadow-2xl ${
              isLegalModalClosing ? "legal-modal-exit" : "legal-modal-enter"
            }`}
          >
            <button
              type="button"
              onClick={closeLegalModal}
              className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors duration-150"
              aria-label="Close"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            {legalModal === "imprint" ? (
              <ImprintContent />
            ) : (
              <PrivacyContent lastUpdated={privacyLastUpdated} />
            )}
          </div>
        </div>
      ) : null}
      <div className="fade-top" />
      <div className="fade-bottom" />
    </section>
  );
}
