/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require("child_process");
const { isDeepStrictEqual } = require("util");
const {
  loadFightStore,
  saveFightStore,
  mergeFight,
  applyStatuses,
  buildFightId,
} = require("./fightStore");

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function pairKey(fight) {
  const red = normalizeName(fight?.fighters?.red);
  const blue = normalizeName(fight?.fighters?.blue);
  const sport = String(fight?.sport || "").toLowerCase();
  return `${sport}|${red}|${blue}`;
}

function dateOnlyToMs(fight) {
  const dateOnly = String(fight?.dateUTC || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return NaN;
  }
  return Date.parse(`${dateOnly}T00:00:00.000Z`);
}

function fightScore(fight) {
  let score = 0;
  if (typeof fight?.dateUTC === "string" && !fight.dateUTC.endsWith("T00:00:00Z")) {
    score += 3;
  }
  if (typeof fight?.link === "string" && fight.link) {
    if (/espn\.com\/boxing\/story/i.test(fight.link)) {
      score += 1;
    } else {
      score += 4;
    }
  }
  if (fight?.broadcaster) score += 1;
  if (fight?.location) score += 1;
  if (fight?.eventName) score += 1;
  return score;
}

function coalesceNearDuplicateFights(store) {
  const entries = Object.entries(store.fights || {});
  const grouped = new Map();

  for (const [id, fight] of entries) {
    const key = pairKey(fight);
    const list = grouped.get(key) || [];
    list.push([id, fight]);
    grouped.set(key, list);
  }

  let collapsed = 0;

  for (const [, list] of grouped) {
    if (list.length < 2) {
      continue;
    }

    const millis = list
      .map(([id, fight]) => [id, fight, dateOnlyToMs(fight)])
      .filter(([, , ms]) => Number.isFinite(ms));

    if (millis.length !== list.length) {
      continue;
    }

    const minDate = Math.min(...millis.map(([, , ms]) => ms));
    const maxDate = Math.max(...millis.map(([, , ms]) => ms));
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Only coalesce likely duplicates caused by minor date drift.
    if (maxDate - minDate > oneDayMs) {
      continue;
    }

    const best = list
      .slice()
      .sort((a, b) => fightScore(b[1]) - fightScore(a[1]))[0];

    const keepId = buildFightId(best[1]);
    store.fights[keepId] = {
      ...best[1],
      id: keepId,
    };

    for (const [id] of list) {
      if (id !== keepId) {
        delete store.fights[id];
        collapsed += 1;
      }
    }
  }

  return collapsed;
}

function findEquivalentExistingId(store, scrapedFight, directId) {
  const direct = store.fights[directId];
  if (direct) {
    return directId;
  }

  const targetKey = pairKey(scrapedFight);
  const targetMs = dateOnlyToMs(scrapedFight);
  if (!Number.isFinite(targetMs)) {
    return null;
  }

  const oneDayMs = 24 * 60 * 60 * 1000;
  for (const [existingId, existingFight] of Object.entries(store.fights || {})) {
    if (pairKey(existingFight) !== targetKey) {
      continue;
    }

    const existingMs = dateOnlyToMs(existingFight);
    if (!Number.isFinite(existingMs)) {
      continue;
    }

    if (Math.abs(existingMs - targetMs) <= oneDayMs) {
      return existingId;
    }
  }

  return null;
}

function runStep(name, command) {
  console.log(`\n--- ${name} ---`);
  try {
    const output = execSync(command, { encoding: "utf-8" });
    const result = JSON.parse(output.trim());
    return result;
  } catch {
    console.error(`Failed: ${name}`);
    process.exit(1);
  }
}

function mergeScrapedFights(store, scrapedFights, sourceName) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const newFights = [];
  let exampleUpdatedFight = null;

  for (const scrapedFight of scrapedFights) {
    const incomingId = buildFightId(scrapedFight);
    if (!incomingId) {
      continue;
    }

    const matchId = findEquivalentExistingId(store, scrapedFight, incomingId);
    const existing = matchId ? store.fights[matchId] : null;
    const merged = mergeFight(existing, { ...scrapedFight, id: incomingId }, ["link"]);

    if (!existing) {
      store.fights[merged.id] = merged;
      added += 1;
      newFights.push(merged);
    } else {
      const changed = !isDeepStrictEqual(existing, merged) || matchId !== merged.id;
      if (changed) {
        if (!exampleUpdatedFight) {
          exampleUpdatedFight = {
            id: merged.id,
            fighters: `${merged?.fighters?.red || "Unknown"} vs ${merged?.fighters?.blue || "Unknown"}`,
          };
        }
        store.fights[merged.id] = merged;
        if (matchId && matchId !== merged.id) {
          delete store.fights[matchId];
        }
        updated += 1;
      } else {
        skipped += 1;
      }
    }
  }

  if (newFights.length > 0) {
    console.log(`New fights from ${sourceName}:`);
    for (const fight of newFights) {
      const red = fight?.fighters?.red || "Unknown";
      const blue = fight?.fighters?.blue || "Unknown";
      const date = String(fight?.dateUTC || "").slice(0, 10) || "Unknown date";
      console.log(`+ [${fight.id}] ${red} vs ${blue} (${date})`);
    }
  }

  return { added, updated, skipped, newFights, exampleUpdatedFight };
}

function hasReliableFightCardLink(fight) {
  const link = String(fight?.link || "").trim();
  if (!link) {
    return false;
  }

  const placeholderPatterns = [
    /google\.com\/search/i,
    /espn\.com\/boxing\/story/i,
    /espn\.com\/mma\/fightcenter/i,
  ];

  return !placeholderPatterns.some((pattern) => pattern.test(link));
}

function getLinkGaps(store) {
  const gaps = [];
  for (const [id, fight] of Object.entries(store.fights || {})) {
    if (!hasReliableFightCardLink(fight)) {
      gaps.push([id, fight]);
    }
  }
  return gaps;
}

console.log("Starting fight data update pipeline");

const store = loadFightStore();

const espn = runStep("ESPN scraper", "node espnScraper.js");
const espnMerge = mergeScrapedFights(store, espn.fights || [], "espn");
console.log(
  `Raw events scanned: ${espn.rawEventsScanned || 0} | Valid fights extracted: ${espn.validFightsExtracted || 0} | invalidFights: ${espn.invalidFights || 0} | duplicateFights: ${espn.duplicateFights || 0}`,
);
console.log(
  `Merge result: +${espnMerge.added} new | ~${espnMerge.updated} updated | =${espnMerge.skipped} unchanged`,
);
if (espnMerge.exampleUpdatedFight) {
  console.log(
    `Example updated fight: [${espnMerge.exampleUpdatedFight.id}] ${espnMerge.exampleUpdatedFight.fighters}`,
  );
}

const ufc = runStep("UFC scraper", "node ufcScraper.js");
const ufcMerge = mergeScrapedFights(store, ufc.fights || [], "ufc");
console.log(
  `Raw events scanned: ${ufc.rawEventsScanned || 0} | Valid fights extracted: ${ufc.validFightsExtracted || 0} | invalidFights: ${ufc.invalidFights || 0} | duplicateFights: ${ufc.duplicateFights || 0}`,
);
console.log(
  `Merge result: +${ufcMerge.added} new | ~${ufcMerge.updated} updated | =${ufcMerge.skipped} unchanged`,
);
if (!espnMerge.exampleUpdatedFight && ufcMerge.exampleUpdatedFight) {
  console.log(
    `Example updated fight: [${ufcMerge.exampleUpdatedFight.id}] ${ufcMerge.exampleUpdatedFight.fighters}`,
  );
}
if (!espnMerge.exampleUpdatedFight && !ufcMerge.exampleUpdatedFight) {
  console.log("Example updated fight: none (no merge changes)");
}

const collapsedBeforeEnrich = coalesceNearDuplicateFights(store);
saveFightStore(applyStatuses(store));

const enrich = runStep("Enrich data", "node enrichTimesESPN.js");
console.log(
  `Raw events scanned: ${enrich.rawEventsScanned || 0} | Valid fights extracted: ${enrich.validFightsExtracted || 0} | invalidFights: ${enrich.invalidFights || 0} | duplicateFights: ${enrich.duplicateFights || 0}`,
);
if (enrich.exampleEnrichedFight) {
  console.log(
    `Example enriched fight: [${enrich.exampleEnrichedFight.id}] ${enrich.exampleEnrichedFight.from} -> ${enrich.exampleEnrichedFight.to}`,
  );
} else {
  console.log("Example enriched fight: none (no time changes)");
}

const finalStore = applyStatuses(loadFightStore());
const collapsedAfterEnrich = coalesceNearDuplicateFights(finalStore);
saveFightStore(finalStore);

const totalFights = Object.keys(finalStore.fights || {}).length;
const newFightCount = espnMerge.added + ufcMerge.added;
const mergedUpdates = espnMerge.updated + ufcMerge.updated;
const enrichmentUpdates = enrich.updated || 0;
const totalChanges = newFightCount + mergedUpdates + enrichmentUpdates + collapsedBeforeEnrich + collapsedAfterEnrich;
const pipelineStatus = totalChanges > 0 ? "UPDATED" : "OK";

console.log("\nSummary:");
console.log(
  JSON.stringify(
    {
      totalFights,
      newFights: newFightCount,
      mergedUpdates,
      mergedSkippedNoChange: (espnMerge.skipped || 0) + (ufcMerge.skipped || 0),
      enrichmentUpdates,
      enrichmentSkippedNoChange: enrich.unchanged || 0,
      deduped: collapsedBeforeEnrich + collapsedAfterEnrich,
      invalidFights:
        (espn.invalidFights || 0) +
        (ufc.invalidFights || 0) +
        (enrich.invalidFights || 0),
      duplicateFights:
        (espn.duplicateFights || 0) +
        (ufc.duplicateFights || 0) +
        (enrich.duplicateFights || 0),
      unmatchedFightsDuringEnrichment: enrich.skipped || 0,
      status: pipelineStatus,
    },
    null,
    2,
  ),
);
console.log(
  `${totalFights} fights | ${newFightCount} new | ${mergedUpdates} updated | ${enrichmentUpdates} enriched`,
);
console.log(`Pipeline status: ${pipelineStatus}`);
console.log(`Completed at: ${new Date().toISOString()}`);

const linkGaps = getLinkGaps(finalStore);
if (linkGaps.length > 0) {
  console.log("\nFight Card Link Alert:");
  for (const [id, fight] of linkGaps) {
    const red = fight?.fighters?.red || "Unknown";
    const blue = fight?.fighters?.blue || "Unknown";
    const date = String(fight?.dateUTC || "").slice(0, 10) || "Unknown date";
    const link = String(fight?.link || "MISSING");
    console.log(`! [${id}] ${red} vs ${blue} (${date}) -> ${link}`);
  }
} else {
  console.log("\nFight Card Link Alert: none missing");
}
