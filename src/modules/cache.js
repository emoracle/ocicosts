"use strict";

const fs = require("fs");
const path = require("path");

const LOCK_TIMEOUT_MS = 2000;
const LOCK_RETRY_MS = 25;
const STALE_LOCK_MS = 30000;

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
        tagMap.set(ocid, entry.tags);
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

  const releaseLock = acquireCacheLock(cachePath);
  try {
    const obj = readCacheObject(cachePath);
    const ts = Date.now();
    const keys = new Set([...nameMap.keys(), ...tagMap.keys()]);
    for (const ocid of keys) {
      const entry = {
        name: nameMap.get(ocid) || null,
        ts,
      };
      if (tagMap.has(ocid)) {
        entry.tags = tagMap.get(ocid);
      }
      obj[ocid] = entry;
    }
    atomicWriteJson(cachePath, obj);
  } finally {
    releaseLock();
  }
}

function readCacheObject(cachePath) {
  try {
    const value = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function atomicWriteJson(cachePath, value) {
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, cachePath);
  } finally {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function acquireCacheLock(cachePath) {
  const lockPath = `${cachePath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const descriptor = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      return () => {
        try {
          fs.closeSync(descriptor);
        } finally {
          try {
            fs.unlinkSync(lockPath);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (isStaleLock(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
        } catch (unlinkError) {
          if (unlinkError.code !== "ENOENT") throw unlinkError;
        }
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for cache lock: ${lockPath}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
    }
  }
}

function isStaleLock(lockPath) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (Number.isInteger(lock.pid) && lock.pid > 0) {
      try {
        process.kill(lock.pid, 0);
        return false;
      } catch (error) {
        return error.code === "ESRCH";
      }
    }
    return Date.now() - fs.statSync(lockPath).mtimeMs > STALE_LOCK_MS;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    try {
      return Date.now() - fs.statSync(lockPath).mtimeMs > STALE_LOCK_MS;
    } catch (statError) {
      return statError.code === "ENOENT";
    }
  }
}

module.exports = { loadCache, saveCache };
