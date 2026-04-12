import FightItem from "@/components/FightItem";
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
};

export default function DateSection({
  dateKey,
  fights,
  highlightType,
  highlightedIds,
  timezone,
  activeFightId,
  setActiveFightId,
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
      className={`day-group space-y-3 ${hasActiveFight ? "is-active" : ""}`}
      data-highlighted-section={hasHighlightedFight ? "true" : undefined}
    >
      <div className="day-group-header relative">
        <div className="pointer-events-none absolute -left-10 top-0 h-full w-10">
          <div
            className={`timeline-dot absolute left-[6px] top-1/2 h-[7px] w-[7px] -translate-x-[45%] -translate-y-1/2 rounded-full ${
              hasHighlightedFight ? "is-highlighted" : ""
            } ${
              hasActiveFight ? "active" : ""
            }`}
          />
        </div>
        <div className="flex items-center">
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
        </div>
      </div>
      <ul className="space-y-1">
        {fights.map((fight) => {
          const fightId = getFightId(fight);
          return (
          <FightItem
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
