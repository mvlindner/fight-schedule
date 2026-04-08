/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "..", "data", "fights.json");

function normalizeIdPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toDateOnly(fight) {
  if (typeof fight?.dateUTC === "string" && fight.dateUTC.length >= 10) {
    return fight.dateUTC.slice(0, 10);
  }
  if (typeof fight?.date === "string" && fight.date.length >= 10) {
    return fight.date.slice(0, 10);
  }
  return "";
}

function buildFightId(fight) {
  const red = normalizeIdPart(fight?.fighters?.red);
  const blue = normalizeIdPart(fight?.fighters?.blue);
  const date = normalizeIdPart(toDateOnly(fight));
  if (!red || !blue || !date) {
    return String(fight?.id || "");
  }
  return `${red}${blue}${date}`;
}

function statusFromFightDate(fight, now = new Date()) {
  const dateOnly = toDateOnly(fight);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return "upcoming";
  }

  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const fightUtc = new Date(`${dateOnly}T00:00:00.000Z`);
  return fightUtc < todayUtc ? "past" : "upcoming";
}

function canonicalizeFight(fight) {
  const id = buildFightId(fight);
  return {
    ...fight,
    id,
    status: statusFromFightDate(fight),
  };
}

function normalizeStoreShape(raw) {
  if (!raw) {
    return { fights: {} };
  }

  if (Array.isArray(raw)) {
    const fights = {};
    for (const fight of raw) {
      const normalized = canonicalizeFight(fight);
      if (!normalized.id) {
        continue;
      }
      fights[normalized.id] = normalized;
    }
    return { fights };
  }

  if (typeof raw === "object" && raw.fights && typeof raw.fights === "object") {
    const fights = {};
    for (const [id, fight] of Object.entries(raw.fights)) {
      const normalized = canonicalizeFight({ ...fight, id });
      if (!normalized.id) {
        continue;
      }
      fights[normalized.id] = normalized;
    }
    return { fights };
  }

  return { fights: {} };
}

function loadFightStore() {
  if (!fs.existsSync(FILE_PATH)) {
    return { fights: {} };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    return normalizeStoreShape(raw);
  } catch {
    return { fights: {} };
  }
}

function saveFightStore(store) {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function mergeFight(existingFight, incomingFight, protectedFields = ["link"]) {
  const incoming = canonicalizeFight(incomingFight);
  const existing = existingFight ? canonicalizeFight(existingFight) : null;

  if (!existing) {
    return incoming;
  }

  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }

  // Keep higher-precision known time when incoming source only has a date-level placeholder.
  if (
    typeof existing.dateUTC === "string" &&
    typeof incoming.dateUTC === "string" &&
    !existing.dateUTC.endsWith("T00:00:00Z") &&
    incoming.dateUTC.endsWith("T00:00:00Z")
  ) {
    merged.dateUTC = existing.dateUTC;
  }

  for (const field of protectedFields) {
    if (existing[field] !== undefined && existing[field] !== null && existing[field] !== "") {
      merged[field] = existing[field];
    }
  }

  merged.id = buildFightId(merged);
  merged.status = statusFromFightDate(merged);
  return merged;
}

function applyStatuses(store) {
  const next = { fights: {} };
  for (const [id, fight] of Object.entries(store.fights || {})) {
    const normalized = canonicalizeFight({ ...fight, id });
    if (!normalized.id) {
      continue;
    }
    next.fights[normalized.id] = normalized;
  }
  return next;
}

module.exports = {
  FILE_PATH,
  buildFightId,
  loadFightStore,
  saveFightStore,
  mergeFight,
  applyStatuses,
};
