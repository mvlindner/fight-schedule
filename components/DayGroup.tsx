import { motion } from "framer-motion";
import FightCard from "@/components/FightCard";
import {
  getFightId,
  formatDateLabel,
  type Fight,
  type HighlightType,
  type TimezoneOption,
} from "@/lib/time";

type Props = {
  dateKey: string;
  fights: Fight[];
  highlightType: HighlightType;
  highlightedIds: Set<string>;
  timezone: TimezoneOption;
  activeFightId: string | null;
  setActiveFightId: (id: string) => void;
  animateTimeline: boolean;
};

export default function DayGroup({
  dateKey,
  fights,
  highlightType,
  highlightedIds,
  timezone,
  activeFightId,
  setActiveFightId,
  animateTimeline,
}: Props) {
  const hasHighlightedFight = fights.some((fight) => highlightedIds.has(getFightId(fight)));
  const hasActiveFight = fights.some((fight) => getFightId(fight) === activeFightId);

  const sectionLabel =
    hasHighlightedFight && highlightType === "tonight"
      ? "TONIGHT"
      : hasHighlightedFight && highlightType === "next"
        ? "NEXT"
        : null;

  return (
    <section
      className="day-group space-y-3"
      data-highlighted-section={hasHighlightedFight ? "true" : undefined}
    >
      <div className="relative">
        <div className="pointer-events-none absolute -left-10 top-0 h-full w-10">
          <motion.div
            initial={animateTimeline ? { opacity: 0, scale: 0.75, y: 4 } : false}
            animate={animateTimeline ? { opacity: 1, scale: 1, y: 0 } : false}
            transition={
              animateTimeline
                ? { duration: 0.78, ease: [0.16, 1, 0.3, 1] }
                : { duration: 0.78, ease: [0.16, 1, 0.3, 1] }
            }
            className={`timeline-dot absolute left-[6px] top-1/2 h-[7px] w-[7px] -translate-x-[45%] -translate-y-1/2 rounded-full ${
              hasHighlightedFight ? "is-highlighted" : ""
            } ${
              hasActiveFight ? "active" : ""
            }`}
          />
        </div>
        <motion.div
          className="flex items-center"
          initial={animateTimeline ? { opacity: 0, y: 2 } : false}
          animate={animateTimeline ? { opacity: 1, y: 0 } : false}
          transition={
            animateTimeline
              ? { duration: 0.72, ease: [0.16, 1, 0.3, 1], delay: 0.12 }
              : { duration: 0.72, ease: [0.16, 1, 0.3, 1], delay: 0.12 }
          }
        >
          <span className="date-label text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 opacity-60">
            {formatDateLabel(dateKey, timezone)}
          </span>
          {sectionLabel && (
            <span
              className={`ml-2 text-[10px] tracking-[0.2em] uppercase font-medium text-violet-600 dark:text-red-400 ${
                sectionLabel === "NEXT" ? "opacity-70" : ""
              }`}
            >
              {sectionLabel}
            </span>
          )}
        </motion.div>
      </div>
      <ul className="space-y-1">
        {fights.map((fight) => {
          const fightId = getFightId(fight);
          return (
            <FightCard
              key={fightId}
              fight={fight}
              timezone={timezone}
              isHighlighted={highlightedIds.has(fightId)}
              fightId={fightId}
              isActive={activeFightId === fightId}
              setActiveFightId={setActiveFightId}
            />
          );
        })}
      </ul>
    </section>
  );
}
