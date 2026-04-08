/* eslint-disable @typescript-eslint/no-require-imports */
const axios = require("axios");
const cheerio = require("cheerio");
const { buildFightId } = require("./scripts/fightStore");

const ESPN_URL =
  "https://www.espn.com/boxing/story/_/id/12508267/boxing-schedule";
const CURRENT_YEAR = 2026;

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function toIsoDate(dateLabel) {
  const clean = normalizeWhitespace(dateLabel).replace(/,$/, "");
  const parsed = new Date(`${clean} ${CURRENT_YEAR} UTC`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00:00Z`;
}

function resolveFightLink(fight) {
  if (fight.link && fight.link.includes("espn")) {
    return fight.link;
  }

  if (fight.sport === "mma" && fight.eventName) {
    return "https://www.espn.com/mma/fightcenter";
  }

  return `https://www.google.com/search?q=${encodeURIComponent(
    `${fight.fighters.red} vs ${fight.fighters.blue} fight card`,
  )}`;
}

function cleanFighterName(name) {
  return normalizeWhitespace(name).replace(/^title fight:\s*/i, "");
}

function parseListItem(text) {
  const normalized = normalizeWhitespace(text);
  const parts = normalized.split("--");
  if (parts.length < 2) {
    return null;
  }

  const metadata = normalizeWhitespace(parts[0]);
  const fightersChunk = normalizeWhitespace(parts.slice(1).join("--"));

  const dateLabel = normalizeWhitespace(metadata.split(":")[0] || "");
  const dateUTC = toIsoDate(dateLabel);
  if (!dateUTC) {
    return null;
  }

  const vsMatch = fightersChunk.match(
    /(?:^|:\s*)([^,;]+?)\s+(?:vs\.?|v\.)\s+([^,;]+?)(?:,|;|$)/i,
  );
  if (!vsMatch) {
    return null;
  }

  const red = cleanFighterName(vsMatch[1]);
  const blue = cleanFighterName(vsMatch[2]);
  const broadcasterMatch = metadata.match(/\(([^)]+)\)\s*$/);
  const broadcaster = normalizeWhitespace(broadcasterMatch?.[1] || "");
  const locationPart = metadata.split(":")[1] || "";
  const location = normalizeWhitespace(locationPart)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

  return {
    id: buildFightId({
      fighters: { red, blue },
      dateUTC,
    }),
    sport: "boxing",
    eventName: null,
    fighters: {
      red,
      blue,
    },
    dateUTC,
    location: location || undefined,
    broadcaster: broadcaster || undefined,
    link: ESPN_URL,
  };
}

async function run() {
  const response = await axios.get(ESPN_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Node.js scraper)",
    },
    timeout: 20000,
  });

  const $ = cheerio.load(response.data);
  const keyDatesHeader = $("h1, h2, h3, h4, h5, h6")
    .filter((_, el) =>
      normalizeWhitespace($(el).text()).toLowerCase().startsWith("key dates"),
    )
    .first();

  if (!keyDatesHeader.length) {
    throw new Error('Could not find "Key dates" header.');
  }

  const keyDatesList = keyDatesHeader.nextAll("ul").first();
  if (!keyDatesList.length) {
    throw new Error('Could not find <ul> following "Key dates" header.');
  }

  const fights = [];
  const seenIds = new Set();
  const listItems = keyDatesList.find("li");
  let rawEventsScanned = 0;
  let validFightsExtracted = 0;
  let invalidFights = 0;
  let duplicateFights = 0;

  listItems.each((_, li) => {
  rawEventsScanned += 1;
  const parsed = parseListItem($(li).text());

  if (!parsed) {
    invalidFights += 1;
    return;
  }

  if (seenIds.has(parsed.id)) {
    duplicateFights += 1;
    return;
  }

  seenIds.add(parsed.id);
  parsed.link = resolveFightLink(parsed);
  fights.push(parsed);
  validFightsExtracted += 1;
});

const result = {
  source: "espn",
  rawEventsScanned,
  validFightsExtracted,
  invalidFights,
  duplicateFights,
  fights,
};

console.log(JSON.stringify(result));
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
