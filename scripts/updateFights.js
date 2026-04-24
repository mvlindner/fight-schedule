/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { isDeepStrictEqual } = require("util");
const {
  loadFightStore,
  saveFightStore,
  mergeFight,
  applyStatuses,
  buildFightId,
} = require("./fightStore");
const MANUAL_FIGHTS_PATH = path.join(__dirname, "..", "data", "manualFights.json");

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

function loadManualFightEntries() {
  if (!fs.existsSync(MANUAL_FIGHTS_PATH)) {
    return { entries: [], parseError: false, invalidShape: false };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(MANUAL_FIGHTS_PATH, "utf8"));
    if (Array.isArray(raw)) {
      return { entries: raw, parseError: false, invalidShape: false };
    }
    if (raw && Array.isArray(raw.fights)) {
      return { entries: raw.fights, parseError: false, invalidShape: false };
    }
    return { entries: [], parseError: false, invalidShape: true };
  } catch {
    return { entries: [], parseError: true, invalidShape: false };
  }
}

function writeManualFightEntries(entries) {
  fs.mkdirSync(path.dirname(MANUAL_FIGHTS_PATH), { recursive: true });
  fs.writeFileSync(
    MANUAL_FIGHTS_PATH,
    `${JSON.stringify({ fights: entries }, null, 2)}\n`,
    "utf8",
  );
}

function isOlderThan24hAfterFightWindow(fight, now = new Date()) {
  const scheduledDate = getScheduledDateForCleanup(fight);
  if (!scheduledDate) {
    return false;
  }

  const fightDateWithBuffer = new Date(scheduledDate);
  fightDateWithBuffer.setHours(fightDateWithBuffer.getHours() + 12);
  return now - fightDateWithBuffer > 24 * 60 * 60 * 1000;
}

function pruneManualFightEntries(entries) {
  const now = new Date();
  const keptEntries = [];
  let deletedCount = 0;
  let exampleDeleted = null;

  for (const entry of entries) {
    if (isOlderThan24hAfterFightWindow(entry, now)) {
      if (!exampleDeleted) {
        const red = entry?.fighters?.red || "Unknown";
        const blue = entry?.fighters?.blue || "Unknown";
        exampleDeleted = `${red} vs ${blue}`;
      }
      deletedCount += 1;
      continue;
    }
    keptEntries.push(entry);
  }

  return { keptEntries, deletedCount, exampleDeleted };
}

function normalizeManualFights(entries) {
  const fights = [];
  let invalid = 0;

  for (const entry of entries) {
    const sport = String(entry?.sport || "").trim().toLowerCase();
    const red = String(entry?.fighters?.red || "").trim();
    const blue = String(entry?.fighters?.blue || "").trim();
    const dateUTC = String(entry?.dateUTC || "").trim();
    if (!sport || !red || !blue || !dateUTC) {
      invalid += 1;
      continue;
    }

    fights.push({
      id: buildFightId({ fighters: { red, blue }, dateUTC }),
      sport,
      eventName: entry?.eventName ?? null,
      fighters: { red, blue },
      dateUTC,
      location: entry?.location || undefined,
      broadcaster: entry?.broadcaster || undefined,
      isTitleFight: entry?.isTitleFight === true,
      titleLabel: entry?.titleLabel || undefined,
      titleDetails: entry?.titleDetails || undefined,
      link: entry?.link || undefined,
    });
  }

  return { fights, invalid };
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

function getScheduledDateForCleanup(fight) {
  if (typeof fight?.date === "string" && fight.date) {
    const dateFromDate = new Date(fight.date);
    if (!Number.isNaN(dateFromDate.getTime())) {
      return dateFromDate;
    }
  }

  if (typeof fight?.dateUTC === "string" && fight.dateUTC) {
    const dateFromUtc = new Date(fight.dateUTC);
    if (!Number.isNaN(dateFromUtc.getTime())) {
      return dateFromUtc;
    }
  }

  return null;
}

function cleanupFights(store, scrapedFights) {
  if (!scrapedFights || scrapedFights.length < 3) {
    console.warn("Skipping deletion: scraper returned too few fights");
    console.log("Past fights deleted: 0");
    return { deletedCount: 0, exampleDeleted: null };
  }

  const scrapedIds = new Set(
    scrapedFights.map((fight) => String(fight?.id || "").trim()).filter(Boolean),
  );

  const now = new Date();
  let deletedCount = 0;
  let exampleDeleted = null;

  for (const [id, fight] of Object.entries(store.fights || {})) {
    const scheduledDate = getScheduledDateForCleanup(fight);
    if (!scheduledDate) {
      continue;
    }

    const fightDateWithBuffer = new Date(scheduledDate);
    fightDateWithBuffer.setHours(fightDateWithBuffer.getHours() + 12);

    const timeSinceFightMs = now - fightDateWithBuffer;
    const olderThan24hSinceScheduledFight =
      timeSinceFightMs > 24 * 60 * 60 * 1000;

    const isPast = fight.status === "past";
    const notInScrape = !scrapedIds.has(id);

    if (isPast && olderThan24hSinceScheduledFight && notInScrape) {
      if (!exampleDeleted) {
        const red = fight?.fighters?.red || "Unknown";
        const blue = fight?.fighters?.blue || "Unknown";
        exampleDeleted = `${red} vs ${blue}`;
      }
      delete store.fights[id];
      deletedCount += 1;
    }
  }

  console.log(`Past fights deleted: ${deletedCount}`);
  if (deletedCount > 0 && exampleDeleted) {
    console.log(`Example deleted: ${exampleDeleted}`);
  }

  return { deletedCount, exampleDeleted };
}

function writePipelineSummary(summary) {
  const summaryPath = process.env.PIPELINE_SUMMARY_PATH;
  if (!summaryPath) {
    return;
  }

  try {
    const resolved = path.resolve(summaryPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(summary, null, 2), "utf8");
  } catch (error) {
    console.warn(`Failed to write pipeline summary: ${error.message}`);
  }
}

console.log("Starting fight data update pipeline");

const store = loadFightStore();

const espn = runStep("ESPN scraper", "node espnScraper.js");
if (espn.sourceUnavailable) {
  console.warn(
    `ESPN scraper source unavailable: ${espn.sourceUnavailableReason || "unknown reason"}`,
  );
}
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

const manualSource = loadManualFightEntries();
if (manualSource.parseError) {
  console.warn("Manual overrides file parse failed; continuing with 0 manual fights.");
}
if (manualSource.invalidShape) {
  console.warn("Manual overrides file shape invalid; expected array or { fights: [] }.");
}
const manualPrune = pruneManualFightEntries(manualSource.entries);
if (manualPrune.deletedCount > 0) {
  writeManualFightEntries(manualPrune.keptEntries);
}
console.log(
  `Manual overrides pruned: ${manualPrune.deletedCount} removed (past +24h)` +
    (manualPrune.exampleDeleted ? ` | Example: ${manualPrune.exampleDeleted}` : ""),
);
const manual = normalizeManualFights(manualPrune.keptEntries);
const manualMerge = mergeScrapedFights(store, manual.fights || [], "manual overrides");
console.log(
  `Manual overrides loaded: ${manual.fights.length} valid | ${manual.invalid || 0} invalid`,
);
console.log(
  `Merge result: +${manualMerge.added} new | ~${manualMerge.updated} updated | =${manualMerge.skipped} unchanged`,
);

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
const scrapedFights = [...(espn.fights || []), ...(ufc.fights || []), ...(manual.fights || [])];
const cleanup = cleanupFights(finalStore, scrapedFights);
saveFightStore(finalStore);

const totalFights = Object.keys(finalStore.fights || {}).length;
const newFightCount = espnMerge.added + ufcMerge.added + manualMerge.added;
const mergedUpdates = espnMerge.updated + ufcMerge.updated + manualMerge.updated;
const enrichmentUpdates = enrich.updated || 0;
const combinedUpdates = mergedUpdates + enrichmentUpdates;
const totalChanges =
  newFightCount +
  mergedUpdates +
  enrichmentUpdates +
  collapsedBeforeEnrich +
  collapsedAfterEnrich +
  manualPrune.deletedCount;
const totalChangesWithCleanup = totalChanges + cleanup.deletedCount;
const pipelineStatus = totalChangesWithCleanup > 0 ? "UPDATED" : "OK";
const completedAt = new Date().toISOString();

console.log("\nSummary:");
console.log(
  JSON.stringify(
    {
      totalFights,
      newFights: newFightCount,
      mergedUpdates,
      mergedSkippedNoChange:
        (espnMerge.skipped || 0) + (ufcMerge.skipped || 0) + (manualMerge.skipped || 0),
      enrichmentUpdates,
      enrichmentSkippedNoChange: enrich.unchanged || 0,
      deduped: collapsedBeforeEnrich + collapsedAfterEnrich,
      deletedPastFights: cleanup.deletedCount,
      deletedManualOverrides: manualPrune.deletedCount,
      invalidFights:
        (espn.invalidFights || 0) +
        (ufc.invalidFights || 0) +
        (enrich.invalidFights || 0) +
        (manual.invalid || 0),
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
console.log("\n================ PIPELINE TOTALS ================");
console.log(
  `TOTAL: ${totalFights} fights | ${newFightCount} new | ${combinedUpdates} updated | ${cleanup.deletedCount} past deleted`,
);
console.log(`MANUAL OVERRIDES PRUNED: ${manualPrune.deletedCount}`);
console.log(`STATUS: ${pipelineStatus}`);
console.log(`Completed at: ${completedAt}`);
console.log("================================================");

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

writePipelineSummary({
  totalFights,
  newFights: newFightCount,
  updatedFights: combinedUpdates,
  deletedPastFights: cleanup.deletedCount,
  deletedManualOverrides: manualPrune.deletedCount,
  status: pipelineStatus,
  completedAt,
  missingFightCards: linkGaps.length,
  missingFightCardExamples: linkGaps.slice(0, 10).map(([id, fight]) => ({
    id,
    red: fight?.fighters?.red || "Unknown",
    blue: fight?.fighters?.blue || "Unknown",
    date: String(fight?.dateUTC || "").slice(0, 10) || "Unknown date",
    link: String(fight?.link || "MISSING"),
  })),
});
