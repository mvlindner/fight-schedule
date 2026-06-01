/* eslint-disable @typescript-eslint/no-require-imports */
const cheerio = require("cheerio");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const { loadFightStore, saveFightStore, applyStatuses } = require("./scripts/fightStore");
const { buildFightId } = require("./scripts/fightStore");

const BOXINGSCENE_URL = "https://www.boxingscene.com/schedule";
const MANUAL_FIGHTS_PATH = path.join(__dirname, "data", "manualFights.json");
const BOXING_MAIN_EVENT_OFFSET_HOURS = 3;
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const ZONE_BY_ABBR = {
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  GMT: "UTC",
  UTC: "UTC",
  BST: "Europe/London",
};

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNameForMatch(value) {
  return normalize(value)
    .replace(/"[^"]*"/g, " ")
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\((.*?)\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateOnlyToMs(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NaN;
  }
  return Date.parse(`${date}T00:00:00.000Z`);
}

function formatUtcDateTime(dateTime) {
  return dateTime.toUTC().toFormat("yyyy-LL-dd'T'HH:mm:ss'Z'");
}

function parseLocalTimeToUtc(date, rawTime, zoneAbbr) {
  const zone = ZONE_BY_ABBR[String(zoneAbbr || "").toUpperCase()];
  if (!zone) {
    return null;
  }

  const timeMatch = normalize(rawTime).match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!timeMatch) {
    return null;
  }

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2] || "0");
  const meridiem = String(timeMatch[3] || "").toUpperCase();

  if (meridiem) {
    hours %= 12;
    if (meridiem === "PM") {
      hours += 12;
    }
  }

  const [year, month, day] = date.split("-").map(Number);
  const localDateTime = DateTime.fromObject(
    { year, month, day, hour: hours, minute: minutes, second: 0 },
    { zone },
  );

  if (!localDateTime.isValid) {
    return null;
  }

  return formatUtcDateTime(localDateTime);
}

function parseBoxingSceneEvent(text) {
  const currentFormatMatch = text.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*(EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|UTC|BST)/i,
  );

  if (currentFormatMatch) {
    const month = MONTHS[currentFormatMatch[1].toLowerCase()];
    if (!month) {
      return null;
    }

    const year = Number(currentFormatMatch[3]);
    const day = Number(currentFormatMatch[2]);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dateUTC = parseLocalTimeToUtc(
      date,
      currentFormatMatch[4],
      currentFormatMatch[5],
    );

    if (!dateUTC) {
      return null;
    }

    return { date, dateUTC };
  }

  const legacyFormatMatch = text.match(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\|\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*\|\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)|\d{1,2}:\d{2})/i,
  );

  if (!legacyFormatMatch) {
    return null;
  }

  const month = MONTHS[legacyFormatMatch[2].toLowerCase()];
  if (!month) {
    return null;
  }

  const year = Number(legacyFormatMatch[4]);
  const day = Number(legacyFormatMatch[3]);
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dateUTC = parseLocalTimeToUtc(date, legacyFormatMatch[5], "EST");

  if (!dateUTC) {
    return null;
  }

  return { date, dateUTC };
}

function loadManualOverrideIds() {
  if (!fs.existsSync(MANUAL_FIGHTS_PATH)) {
    return new Set();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(MANUAL_FIGHTS_PATH, "utf8"));
    const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.fights) ? raw.fights : [];
    const ids = new Set();

    for (const entry of entries) {
      const id = buildFightId(entry);
      if (id) {
        ids.add(id);
      }
    }

    return ids;
  } catch {
    return new Set();
  }
}

async function run() {
  const store = loadFightStore();
  const fights = Object.values(store.fights || {});
  const manualOverrideIds = loadManualOverrideIds();
  const browser = await chromium.launch({ headless: true });
  let html = "";

  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Node.js BoxingScene enrich script)",
    });
    await page.goto(BOXINGSCENE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500);

    let previousEventCount = await page.locator('a[href^="/events/"]').count();
    for (let i = 0; i < 12; i += 1) {
      const loadMore = page
        .locator('button:has-text("Load more events"), a:has-text("Load more events")')
        .first();
      const hasLoadMore = (await loadMore.count()) > 0;
      if (!hasLoadMore) {
        break;
      }

      try {
        await loadMore.scrollIntoViewIfNeeded();
        await loadMore.click({ timeout: 3000 });
      } catch {
        break;
      }

      await page.waitForTimeout(1500);
      const currentEventCount = await page.locator('a[href^="/events/"]').count();
      if (currentEventCount <= previousEventCount) {
        break;
      }
      previousEventCount = currentEventCount;
    }

    html = await page.content();
  } finally {
    await browser.close();
  }

  const $ = cheerio.load(html);
  const events = [];
  const seenEventUrls = new Set();
  let rawEventsScanned = 0;
  let invalidFights = 0;
  let duplicateFights = 0;

  $('a[href^="/events/"]').each((_, linkEl) => {
    rawEventsScanned += 1;
    const href = normalize($(linkEl).attr("href"));
    if (!href) {
      invalidFights += 1;
      return;
    }
    if (seenEventUrls.has(href)) {
      duplicateFights += 1;
      return;
    }
    seenEventUrls.add(href);

    const card = $(linkEl).closest(".card");
    const text = normalize(card.text());
    if (!/\bv(?:s\.?|\.?)\s/i.test(text)) {
      invalidFights += 1;
      return;
    }

    const parsedEvent = parseBoxingSceneEvent(text);
    if (!parsedEvent) {
      invalidFights += 1;
      return;
    }

    events.push({
      date: parsedEvent.date,
      dateUTC: parsedEvent.dateUTC,
      fightersText: normalizeNameForMatch(text),
    });
  });
  const validFightsExtracted = events.length;

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let skippedManualOverrides = 0;
  let exampleEnrichedFight = null;

  for (const fight of fights) {
    if (manualOverrideIds.has(String(fight?.id || ""))) {
      skippedManualOverrides += 1;
      continue;
    }

    const red = normalizeNameForMatch(fight?.fighters?.red);
    const blue = normalizeNameForMatch(fight?.fighters?.blue);
    const date = String(fight?.dateUTC || "").slice(0, 10);
    const fightDateMs = dateOnlyToMs(date);
    const match = events.find(
      (event) =>
        Number.isFinite(fightDateMs) &&
        Math.abs(dateOnlyToMs(event.date) - fightDateMs) <= 24 * 60 * 60 * 1000 &&
        event.fightersText.includes(red) &&
        event.fightersText.includes(blue),
    );

    if (!match) {
      skipped += 1;
      continue;
    }

    let finalUTC = match.dateUTC;
    if (fight.sport === "boxing") {
      finalUTC = formatUtcDateTime(
        DateTime.fromISO(match.dateUTC, { zone: "UTC" }).plus({
          hours: BOXING_MAIN_EVENT_OFFSET_HOURS,
        }),
      );
    }

    if (fight.dateUTC === finalUTC) {
      unchanged += 1;
      continue;
    }

    if (!exampleEnrichedFight) {
      exampleEnrichedFight = {
        id: fight.id,
        from: fight.dateUTC,
        to: finalUTC,
      };
    }
    fight.dateUTC = finalUTC;
    updated += 1;
  }

  const nextStore = { fights: {} };
  for (const fight of fights) {
    if (!fight?.id) {
      continue;
    }
    nextStore.fights[fight.id] = fight;
  }
  saveFightStore(applyStatuses(nextStore));

 const result = {
  source: "enrich",
  rawEventsScanned,
  validFightsExtracted,
  invalidFights,
  duplicateFights,
  updated,
  unchanged,
  skipped,
  skippedManualOverrides,
  exampleEnrichedFight,
};

console.log(JSON.stringify(result));
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
