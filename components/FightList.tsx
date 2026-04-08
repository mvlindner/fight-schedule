import { useMemo } from "react";
import { LayoutGroup } from "framer-motion";
import DayGroup from "@/components/DayGroup";
import {
  getLocalDateKey,
  getUtcDateTime,
  type Fight,
  type HighlightType,
  type TimezoneOption,
} from "@/lib/time";

type Props = {
  fights: Fight[];
  timezone: TimezoneOption;
  highlightType: HighlightType;
  highlightedIds: Set<string>;
  activeFightId: string | null;
  setActiveFightId: (id: string) => void;
  animatedTimelineDayKeys: string[];
};

export default function FightList({
  fights,
  timezone,
  highlightType,
  highlightedIds,
  activeFightId,
  setActiveFightId,
  animatedTimelineDayKeys,
}: Props) {
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

  return (
    <LayoutGroup id="fight-list-layout">
      <section className="space-y-24">
        {groupedFights.map(([dateKey, dateFights]) => (
          <DayGroup
            key={dateKey}
            dateKey={dateKey}
            fights={dateFights}
            highlightType={highlightType}
            highlightedIds={highlightedIds}
            timezone={timezone}
            activeFightId={activeFightId}
            setActiveFightId={setActiveFightId}
            animateTimeline={animatedTimelineDayKeys.includes(dateKey)}
          />
        ))}
      </section>
    </LayoutGroup>
  );
}
