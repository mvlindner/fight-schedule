import { DateTime } from "luxon";

export const TIMEZONE_OPTIONS = ["UTC", "CET", "EST", "PST"] as const;
export type TimezoneOption = (typeof TIMEZONE_OPTIONS)[number];

export type Fight = {
  date: string;
  time_utc: string;
  fighters: [string, string];
  link: string;
  promotion: "boxing" | "ufc";
  eventName?: string;
  location?: string;
  broadcaster?: string;
};

export type HighlightType = "tonight" | "next" | null;

export type HighlightedFights = {
  type: HighlightType;
  ids: string[];
};

const ZONE_BY_TIMEZONE: Record<TimezoneOption, string> = {
  UTC: "UTC",
  CET: "Europe/Berlin",
  EST: "America/New_York",
  PST: "America/Los_Angeles",
};

const DEBUG_DATE: string | null = null;
// Example for testing only:
//const DEBUG_DATE: string | null = "2026-04-06T18:00:00Z";

export function getNow(): Date {
  return DEBUG_DATE ? new Date(DEBUG_DATE) : new Date();
}

export function getUtcDateTime(date: string, timeUtc: string): DateTime {
  return DateTime.fromISO(`${date}T${timeUtc}`, { zone: "UTC" });
}

export function getFightId(fight: Fight): string {
  return `${fight.date}-${fight.time_utc}-${fight.fighters[0]}-${fight.fighters[1]}`;
}

export function formatFightTime(
  date: string,
  timeUtc: string,
  timezone: TimezoneOption,
): string {
  return getUtcDateTime(date, timeUtc)
    .setZone(ZONE_BY_TIMEZONE[timezone])
    .toFormat("HH:mm");
}

export function getLocalDateKey(
  date: string,
  timeUtc: string,
  timezone: TimezoneOption,
): string {
  return getUtcDateTime(date, timeUtc)
    .setZone(ZONE_BY_TIMEZONE[timezone])
    .toFormat("yyyy-LL-dd");
}

export function getCurrentLocalDateKey(timezone: TimezoneOption): string {
  return DateTime.fromJSDate(getNow())
    .setZone(ZONE_BY_TIMEZONE[timezone])
    .toFormat("yyyy-LL-dd");
}

export function isSameDay(dateUTC: string, timezone: TimezoneOption): boolean {
  const now = getNow();
  const zone = ZONE_BY_TIMEZONE[timezone];
  const d1 = new Date(dateUTC).toLocaleDateString("en-US", { timeZone: zone });
  const d2 = now.toLocaleDateString("en-US", { timeZone: zone });
  return d1 === d2;
}

export function getHighlightedFights(
  fights: Fight[],
  timezone: TimezoneOption,
  currentDate?: Date,
): HighlightedFights {
  const sorted = [...fights].sort(
    (a, b) =>
      getUtcDateTime(a.date, a.time_utc).toMillis() -
      getUtcDateTime(b.date, b.time_utc).toMillis(),
  );

  const tonightFights = sorted.filter((fight) => {
    const fightDateUtc = `${fight.date}T${fight.time_utc}:00Z`;
    return isSameDay(fightDateUtc, timezone);
  });

  if (tonightFights.length > 0) {
    return { type: "tonight", ids: tonightFights.map(getFightId) };
  }

  const now = currentDate ?? getNow();
  const nextFight = sorted.find(
    (fight) => getUtcDateTime(fight.date, fight.time_utc).toJSDate() > now,
  );

  if (nextFight) {
    return { type: "next", ids: [getFightId(nextFight)] };
  }

  return { type: null, ids: [] };
}

export function formatDateLabel(dateKey: string, timezone: TimezoneOption): string {
  return DateTime.fromISO(dateKey, { zone: ZONE_BY_TIMEZONE[timezone] }).toFormat(
    "cccc, dd LLL yyyy",
  );
}
