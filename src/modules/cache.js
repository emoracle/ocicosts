"use strict";

const fs = require("fs");
const path = require("path");

function loadCache(cachePath, ttlDays) {
  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const data = JSON.parse(raw);
    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    const entries = new Map();
    for (const [ocid, entry] of Object.entries(data || {})) {
      if (!entry || typeof entry !== "object") continue;
      if (!entry.ts || now - entry.ts > ttlMs) continue;
      // Bewaar alleen niet-lege namen; lege/null waarden worden opnieuw opgehaald.
      if (entry.name) {
        entries.set(ocid, entry.name);
      }
    }
    return entries;
  } catch {
    return new Map();
  }
}

function saveCache(cachePath, map) {
  const dir = path.dirname(cachePath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
  const obj = {};
  const ts = Date.now();
  for (const [ocid, name] of map.entries()) {
    obj[ocid] = { name, ts };
  }
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2));
}

module.exports = { loadCache, saveCache };
