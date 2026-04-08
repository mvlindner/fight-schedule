/* eslint-disable @typescript-eslint/no-require-imports */
const axios = require("axios");
const cheerio = require("cheerio");
const { buildFightId } = require("./scripts/fightStore");

const ESPN_URL = "https://www.espn.com/mma/schedule";
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toCityLocation(location) {
  const parts = normalize(location).split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[1];
  }
  return parts[0] || "";
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

async function run() {
  const response = await axios.get(ESPN_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Node.js UFC scraper)" },
    timeout: 20000,
  });

  const $ = cheerio.load(response.data);
  const year = 2026;
  const ufcFights = [];
  const seenIds = new Set();
  let rawEventsScanned = 0;
  let validFightsExtracted = 0;
  let invalidFights = 0;
  let duplicateFights = 0;

  $("table.Table tr").each((_, tr) => {
    rawEventsScanned += 1;
    const cells = [];
    $(tr).find("td").each((__, td) => {
      cells.push(normalize($(td).text()));
    });
    if (cells.length < 4) {
      invalidFights += 1;
      return;
    }

    const dateText = cells[0];
    const timeText = cells[1];
    const broadcaster = cells[2] || "";
    const eventName = cells[3];
    const location = toCityLocation(cells[4] || "");

    if (!(eventName.includes("UFC") && /\d+/.test(eventName))) {
      invalidFights += 1;
      return;
    }
    if (/UFC\s+Fight\s+Night/i.test(eventName)) {
      invalidFights += 1;
      return;
    }

    const eventNumberMatch = eventName.match(/(\d+)/);
    if (!eventNumberMatch) {
      invalidFights += 1;
      return;
    }
    const eventNumber = eventNumberMatch[1];

    const fightersMatch = eventName.match(/:\s*(.+?)\s+vs\.?\s+(.+)$/i);
    if (!fightersMatch) {
      invalidFights += 1;
      return;
    }
    const red = normalize(fightersMatch[1]);
    const blue = normalize(fightersMatch[2]);

    const dateMatch = dateText.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
    if (!dateMatch) {
      invalidFights += 1;
      return;
    }
    const month = MONTHS[dateMatch[1].toLowerCase()];
    if (!month) {
      invalidFights += 1;
      return;
    }
    const day = Number(dateMatch[2]);

    let hours = 0;
    let minutes = 0;
    const twelveHour = timeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    const twentyFourHour = timeText.match(/^(\d{1,2}):(\d{2})$/);

    if (twelveHour) {
      hours = Number(twelveHour[1]) % 12;
      minutes = Number(twelveHour[2] || "0");
      if (twelveHour[3].toUpperCase() === "PM") hours += 12;
    } else if (twentyFourHour) {
      hours = Number(twentyFourHour[1]);
      minutes = Number(twentyFourHour[2]);
    } else {
      invalidFights += 1;
      return;
    }

    const sport = "mma";
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours + 4, minutes, 0));
    if (sport === "boxing") {
      utcDate.setUTCHours(utcDate.getUTCHours() + 3);
    }
    if (sport === "mma") {
      utcDate.setUTCHours(utcDate.getUTCHours() + 2);
    }
    const yyyy = utcDate.getUTCFullYear();
    const mm = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(utcDate.getUTCDate()).padStart(2, "0");
    const hh = String(utcDate.getUTCHours()).padStart(2, "0");
    const mi = String(utcDate.getUTCMinutes()).padStart(2, "0");
    const dateUTC = `${yyyy}-${mm}-${dd}T${hh}:${mi}:00Z`;

    const id = buildFightId({
      fighters: { red, blue },
      dateUTC,
    });
    if (seenIds.has(id)) {
      duplicateFights += 1;
      return;
    }
    seenIds.add(id);

    ufcFights.push({
      id,
      sport,
      eventName: `UFC ${eventNumber}`,
      fighters: { red, blue },
      dateUTC,
      location: location || undefined,
      broadcaster: normalize(broadcaster) || undefined,
      link: ESPN_URL,
    });
    validFightsExtracted += 1;
  });

  const fights = ufcFights.map((fight) => ({
    ...fight,
    link: resolveFightLink(fight),
  }));

  const result = {
    source: "ufc",
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
