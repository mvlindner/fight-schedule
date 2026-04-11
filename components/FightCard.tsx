import { useRef } from "react";
import { motion } from "framer-motion";
import { formatFightTime, getNow, getUtcDateTime, type Fight, type TimezoneOption } from "@/lib/time";

type Props = {
  fight: Fight;
  timezone: TimezoneOption;
  isHighlighted?: boolean;
  fightId: string;
  isActive: boolean;
  isLastInDay: boolean;
  setActiveFightId: (id: string) => void;
};

export default function FightCard({
  fight,
  timezone,
  isHighlighted = false,
  fightId,
  isActive,
  isLastInDay,
  setActiveFightId,
}: Props) {
  const TITLE_OFFSET = "calc(3.5rem + 0.5rem)";
  const itemRef = useRef<HTMLLIElement | null>(null);
  const [fighterA, fighterB] = fight.fighters;
  const formattedTime = formatFightTime(fight.date, fight.time_utc, timezone);
  const matchup = `${fighterA} vs ${fighterB}`;
  const fallbackPastByTime =
    getUtcDateTime(fight.date, fight.time_utc).plus({ hours: 12 }).toJSDate() < getNow();
  const isPastFight = fight.status === "past" || fallbackPastByTime;
  const leadingLabel = isPastFight ? "PAST" : formattedTime;
  const fightLine =
    fight.promotion === "ufc" && fight.eventName
      ? `${fight.eventName}: ${matchup}`
      : matchup;
  const broadcaster = (() => {
    const raw = (fight.broadcaster || "").trim();
    if (!raw) return "";
    const withoutPpv = raw.replace(/\bppv\b/gi, "").replace(/\s+/g, " ").trim();
    const first = withoutPpv.split(/[,/]/)[0]?.trim() || withoutPpv;
    return first;
  })();
  const hasLocation = Boolean(fight.location);
  const hasBroadcaster = Boolean(broadcaster);
  const compactTitleLabel =
    fight.promotion === "boxing" && fight.isTitleFight && fight.titleLabel
      ? fight.titleLabel
      : "";
  const hasTitleLabel = Boolean(compactTitleLabel);
  const hasMetaPrefix = hasLocation || hasBroadcaster || hasTitleLabel;

  const handleActivate = () => {
    if (isActive) {
      return;
    }
    setActiveFightId(fightId);
    itemRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <motion.li
      ref={itemRef}
      className="fight-item-row"
      layout
      layoutId={`fight-${fightId}`}
      animate={{ marginBottom: isActive && !isLastInDay ? 24 : 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.95 }}
    >
      <button
        type="button"
        onClick={handleActivate}
        className={`fight-item group w-full text-left flex items-baseline gap-2 py-1 origin-left transform-gpu cursor-pointer ${isActive ? "active" : ""}`}
      >
        <span
          className={`fight-item-time time inline-block w-20 shrink-0 tabular-nums opacity-60 transition-colors duration-200 ${
            isHighlighted
              ? "text-violet-600 dark:text-red-400"
              : isActive
                ? "text-neutral-600 dark:text-neutral-400"
                : "text-neutral-600 dark:text-neutral-400 group-hover:text-violet-600 dark:group-hover:text-red-300"
          }`}
        >
          {leadingLabel}
        </span>
        <span
          className={`fight-item-main fight-title transition-colors duration-200 font-medium tracking-tight ${
            isActive
              ? "text-neutral-900 dark:text-neutral-100"
              : "text-neutral-900 dark:text-neutral-100 group-hover:text-violet-600 dark:group-hover:text-red-300"
          }`}
        >
          {fightLine}
        </span>
      </button>

      <div
        className={`fight-meta text-neutral-600 dark:text-neutral-400 ${
          isActive ? "visible pointer-events-auto" : "pointer-events-none"
        }`}
        style={{ marginLeft: TITLE_OFFSET }}
      >
        <div className="fight-meta-inner">
          {hasLocation && (
            <>
              <span className="meta-location">{fight.location}</span>
            </>
          )}
          {hasLocation && hasBroadcaster && <span className="meta-separator"> {"\u2022"} </span>}
          {hasBroadcaster && <span className="meta-broadcaster">{broadcaster}</span>}
          {(hasLocation || hasBroadcaster) && hasTitleLabel && (
            <span className="meta-separator"> {"\u2022"} </span>
          )}
          {hasTitleLabel && <span className="meta-title">{compactTitleLabel}</span>}
          {hasMetaPrefix && <span className="meta-separator"> {"\u2022"} </span>}
          <a
            href={fight.link}
            target="_blank"
            rel="noopener noreferrer"
            className="card-link"
          >
            fight card
          </a>
        </div>
      </div>
    </motion.li>
  );
}
