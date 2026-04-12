/* eslint-disable @typescript-eslint/no-require-imports */
const cheerio = require("cheerio");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { loadFightStore, saveFightStore, applyStatuses } = require("./scripts/fightStore");
const { buildFightId } = require("./scripts/fightStore");

const BOXINGSCENE_URL = "https://www.boxingscene.com/schedule";
const MANUAL_FIGHTS_PATH = path.join(__dirname, "data", "manualFights.json");
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
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
    if (!text.toLowerCase().includes(" vs ")) {
      invalidFights += 1;
      return;
    }

    const dateMatch = text.match(
      /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\|\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*\|/i,
    );
    if (!dateMatch) {
      invalidFights += 1;
      return;
    }
    const timeMatch = text.match(/\|\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)|\d{1,2}:\d{2})\b/i);
    if (!timeMatch) {
      invalidFights += 1;
      return;
    }

    const month = MONTHS[dateMatch[2].toLowerCase()];
    if (!month) {
      invalidFights += 1;
      return;
    }
    const day = Number(dateMatch[3]);
    const year = Number(dateMatch[4]);
    events.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      fightersText: normalizeNameForMatch(text),
      timeString: normalize(timeMatch[1]).toUpperCase(),
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
    const match = events.find(
      (event) =>
        event.date === date &&
        event.fightersText.includes(red) &&
        event.fightersText.includes(blue),
    );

    if (!match) {
      skipped += 1;
      continue;
    }

    const rawTime = match.timeString;
    let hours = 0;
    let minutes = 0;
    const twelveHour = rawTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    const twentyFourHour = rawTime.match(/^(\d{1,2}):(\d{2})$/);

    if (twelveHour) {
      hours = Number(twelveHour[1]) % 12;
      minutes = Number(twelveHour[2] || "0");
      if (twelveHour[3].toUpperCase() === "PM") {
        hours += 12;
      }
    } else if (twentyFourHour) {
      hours = Number(twentyFourHour[1]);
      minutes = Number(twentyFourHour[2]);
    } else {
      skipped += 1;
      continue;
    }

    const parsedHours = String(hours).padStart(2, "0");
    const parsedMinutes = String(minutes).padStart(2, "0");
    const parsedET = `${parsedHours}:${parsedMinutes}`;

    const [year, month, day] = date.split("-").map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours + 4, minutes, 0));
    if (fight.sport === "boxing") {
      utcDate.setUTCHours(utcDate.getUTCHours() + 3);
    }
    if (fight.sport === "mma") {
      utcDate.setUTCHours(utcDate.getUTCHours() + 2);
    }

    const yyyy = utcDate.getUTCFullYear();
    const mm = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(utcDate.getUTCDate()).padStart(2, "0");
    const hh = String(utcDate.getUTCHours()).padStart(2, "0");
    const mi = String(utcDate.getUTCMinutes()).padStart(2, "0");
    const finalUTC = `${yyyy}-${mm}-${dd}T${hh}:${mi}:00Z`;

    if (!/^\d{2}:\d{2}$/.test(parsedET)) {
      skipped += 1;
      continue;
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
