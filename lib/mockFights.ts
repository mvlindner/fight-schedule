import type { Fight } from "@/lib/time";

type MockFightOptions = {
  removeTodayFight?: boolean;
  includePastFight?: boolean;
};

function toDatePart(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toUtcTimePart(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export function generateMockFights(options: MockFightOptions = {}): Fight[] {
  const fights: Fight[] = [];
  const now = new Date();
  const { removeTodayFight = false, includePastFight = true } = options;

  for (let i = 0; i < 20; i += 1) {
    const offsetDays = i * 2 + (i % 3 === 0 ? 0 : 1);
    const eventDate = new Date(now);
    eventDate.setUTCDate(now.getUTCDate() + offsetDays);
    eventDate.setUTCHours(18 + (i % 5), (i % 2) * 30, 0, 0);

    const promotion: Fight["promotion"] = i % 2 === 0 ? "ufc" : "boxing";
    const fighterA = `Fighter ${i + 1}A`;
    const fighterB = `Fighter ${i + 1}B`;

    fights.push({
      date: toDatePart(eventDate),
      time_utc: toUtcTimePart(eventDate),
      fighters: [fighterA, fighterB],
      link: promotion === "ufc" ? "https://www.espn.com/mma/" : "https://www.espn.com/boxing/",
      promotion,
      eventName: promotion === "ufc" ? `UFC ${300 + i}` : "Boxing Night",
    });
  }

  // Force a same-day cluster to stress spacing and grouped rendering.
  const todayCluster = [0, 1, 2];
  for (const index of todayCluster) {
    if (!fights[index]) {
      continue;
    }
    const sameDay = new Date(now);
    sameDay.setUTCHours(17 + index, 0, 0, 0);
    fights[index] = {
      ...fights[index],
      date: toDatePart(sameDay),
      time_utc: toUtcTimePart(sameDay),
    };
  }

  if (removeTodayFight) {
    const todayKey = toDatePart(now);
    for (const fight of fights) {
      if (fight.date === todayKey) {
        const shifted = new Date(`${fight.date}T${fight.time_utc}:00Z`);
        shifted.setUTCDate(shifted.getUTCDate() + 1);
        fight.date = toDatePart(shifted);
        fight.time_utc = toUtcTimePart(shifted);
      }
    }
  }

  if (includePastFight) {
    const pastDate = new Date(now);
    pastDate.setUTCDate(now.getUTCDate() - 2);
    pastDate.setUTCHours(20, 0, 0, 0);
    fights.push({
      date: toDatePart(pastDate),
      time_utc: toUtcTimePart(pastDate),
      fighters: ["Past Fighter A", "Past Fighter B"],
      link: "https://www.espn.com/boxing/",
      promotion: "boxing",
      eventName: "Archive Main Event",
    });
  }

  return fights;
}
