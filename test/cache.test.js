"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { loadCache, saveCache } = require("../src/modules/cache");

function createCachePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "showcosts-cache-"));
  return path.join(directory, "displayname.json");
}

function runCacheWriter(cachePath, resourceId, displayName) {
  const cacheModule = path.resolve(__dirname, "../src/modules/cache.js");
  const script = [
    `const { saveCache } = require(${JSON.stringify(cacheModule)});`,
    `saveCache(${JSON.stringify(cachePath)}, new Map([[${JSON.stringify(resourceId)}, ${JSON.stringify(displayName)}]]), new Map());`,
  ].join("");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Cache writer exited with ${code}: ${stderr}`));
    });
  });
}

test("saves and reloads cache entries", () => {
  const cachePath = createCachePath();
  saveCache(cachePath, new Map([["resource-a", "Resource A"]]), new Map([["resource-a", "A=B"]]));

  const cache = loadCache(cachePath, 1);
  assert.equal(cache.nameMap.get("resource-a"), "Resource A");
  assert.equal(cache.tagMap.get("resource-a"), "A=B");
  assert.deepEqual(fs.readdirSync(path.dirname(cachePath)), ["displayname.json"]);
});

test("preserves entries written by concurrent processes", async () => {
  const cachePath = createCachePath();

  await Promise.all([
    runCacheWriter(cachePath, "resource-a", "Resource A"),
    runCacheWriter(cachePath, "resource-b", "Resource B"),
  ]);

  const cache = loadCache(cachePath, 1);
  assert.equal(cache.nameMap.get("resource-a"), "Resource A");
  assert.equal(cache.nameMap.get("resource-b"), "Resource B");
  assert.deepEqual(fs.readdirSync(path.dirname(cachePath)), ["displayname.json"]);
});

test("keeps the previous cache intact when serialization fails", () => {
  const cachePath = createCachePath();
  saveCache(cachePath, new Map([["resource-a", "Resource A"]]), new Map());
  const original = fs.readFileSync(cachePath, "utf8");

  assert.throws(
    () => saveCache(cachePath, new Map([["resource-b", "Resource B"]]), new Map([["resource-b", 1n]])),
    /BigInt/
  );

  assert.equal(fs.readFileSync(cachePath, "utf8"), original);
  assert.deepEqual(fs.readdirSync(path.dirname(cachePath)), ["displayname.json"]);
});

test("recovers a lock left behind by a terminated process", () => {
  const cachePath = createCachePath();
  fs.writeFileSync(`${cachePath}.lock`, JSON.stringify({ pid: 99999999 }));

  saveCache(cachePath, new Map([["resource-a", "Resource A"]]), new Map());

  assert.equal(loadCache(cachePath, 1).nameMap.get("resource-a"), "Resource A");
  assert.equal(fs.existsSync(`${cachePath}.lock`), false);
});
