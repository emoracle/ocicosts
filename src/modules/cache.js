"use strict";

const fs = require("fs");
const path = require("path");

function loadCache(cachePath, ttlDays) {
  const nameMap = new Map();
  const tagMap = new Map();
  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const data = JSON.parse(raw);
    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

    for (const [ocid, entry] of Object.entries(data || {})) {
      if (!entry || typeof entry !== "object") continue;
      if (!entry.ts || now - entry.ts > ttlMs) continue;

      if (typeof entry.name === "string" && entry.name) {
        nameMap.set(ocid, entry.name);
      }

      if (Object.prototype.hasOwnProperty.call(entry, "tags")) {
        tagMap.set(ocid, entry.tags || "");
      }
    }
  } catch {
    // ignore
  }
  return { nameMap, tagMap };
}

function saveCache(cachePath, nameMap, tagMap) {
  const dir = path.dirname(cachePath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
  const obj = {};
  const ts = Date.now();
  const keys = new Set([...nameMap.keys(), ...tagMap.keys()]);
  for (const ocid of keys) {
    obj[ocid] = {
      name: nameMap.get(ocid) || null,
      tags: tagMap.has(ocid) ? tagMap.get(ocid) : "",
      ts,
    };
  }
  fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2));
}

module.exports = { loadCache, saveCache };
