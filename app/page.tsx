import FightSchedule from "@/components/FightSchedule";
import fights from "@/data/fights.json";
import { generateMockFights } from "@/lib/mockFights";
import type { Fight } from "@/lib/time";

type ScrapedFight = {
  sport?: string;
  status?: string;
  eventName?: string | null;
  location?: string | null;
  broadcaster?: string | null;
  fighters?: {
    red?: string;
    blue?: string;
  };
  dateUTC?: string;
  link?: string;
};

function toFightList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (raw && typeof raw === "object" && "fights" in raw) {
    const candidate = raw as { fights?: Record<string, unknown> };
    if (candidate.fights && typeof candidate.fights === "object") {
      return Object.values(candidate.fights);
    }
  }

  return [];
}

function normalizeFight(raw: unknown): Fight | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<Fight> & ScrapedFight;
  const status = candidate.status === "past" ? "past" : "upcoming";

  if (
    typeof candidate.date === "string" &&
    typeof candidate.time_utc === "string" &&
    Array.isArray(candidate.fighters) &&
    candidate.fighters.length === 2 &&
    typeof candidate.fighters[0] === "string" &&
    typeof candidate.fighters[1] === "string" &&
    typeof candidate.link === "string"
  ) {
    return {
      date: candidate.date,
      time_utc: candidate.time_utc,
      fighters: [candidate.fighters[0], candidate.fighters[1]],
      link: candidate.link,
      promotion: candidate.promotion === "ufc" ? "ufc" : "boxing",
      status,
      eventName: candidate.eventName ?? undefined,
      location: candidate.location ?? undefined,
      broadcaster: candidate.broadcaster ?? undefined,
    };
  }

  if (
    typeof candidate.dateUTC === "string" &&
    candidate.dateUTC.length >= 16 &&
    candidate.fighters &&
    typeof candidate.fighters.red === "string" &&
    typeof candidate.fighters.blue === "string" &&
    typeof candidate.link === "string"
  ) {
    const date = candidate.dateUTC.slice(0, 10);
    const time_utc = candidate.dateUTC.slice(11, 16);
    const sport = String(candidate.sport || "").toLowerCase();

    return {
      date,
      time_utc,
      fighters: [candidate.fighters.red, candidate.fighters.blue],
      link: candidate.link,
      promotion: sport === "ufc" || sport === "mma" ? "ufc" : "boxing",
      status,
      eventName: candidate.eventName ?? undefined,
      location: candidate.location ?? undefined,
      broadcaster: candidate.broadcaster ?? undefined,
    };
  }

  return null;
}

export default function Home() {
  const USE_MOCK_FIGHTS = false;

  const mockFights = generateMockFights({
    removeTodayFight: false,
    includePastFight: false,
  });

  const sourceFights = USE_MOCK_FIGHTS
    ? mockFights
    : toFightList(fights).map(normalizeFight).filter((fight): fight is Fight => fight !== null);

  return <FightSchedule fights={sourceFights} />;
}
