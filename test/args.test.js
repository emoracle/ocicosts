"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs } = require("../src/modules/args");

test("parses known arguments", () => {
  const { args, help } = parseArgs([
    "--days",
    "10",
    "--showtags",
    "--csv",
    "--tag",
    "A=B",
  ]);

  assert.equal(help, false);
  assert.equal(args.days, 10);
  assert.equal(args.showTags, true);
  assert.equal(args.csv, true);
  assert.equal(args.tag, "A=B");
});

test("throws on unsupported argument", () => {
  assert.throws(() => parseArgs(["--unknown"]), /Unsupported argument/);
});

test("throws when argument value is missing", () => {
  assert.throws(() => parseArgs(["--days"]), /Missing value for argument: --days/);
});

test("loads defaults from settings file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcosts-args-"));
  const settingsPath = path.join(dir, "settings.json");
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ days: 45, top: 12, service: "Load Balancer" }),
    "utf8"
  );

  const { args } = parseArgs([], settingsPath);
  assert.equal(args.days, 45);
  assert.equal(args.top, 12);
  assert.equal(args.service, "Load Balancer");
});

test("normalizes a valid granularity", () => {
  const { args } = parseArgs(["--granularity", "hourly"]);
  assert.equal(args.granularity, "HOURLY");
});

test("rejects invalid numeric options", () => {
  assert.throws(() => parseArgs(["--days", "NaN"]), /Invalid --days/);
  assert.throws(() => parseArgs(["--days", "0"]), /Invalid --days/);
  assert.throws(() => parseArgs(["--top", "1.5"]), /Invalid --top/);
  assert.throws(
    () => parseArgs(["--compartment-depth", "7"]),
    /Invalid --compartment-depth/
  );
  assert.throws(
    () => parseArgs(["--cache-ttl-days", "-1"]),
    /Invalid --cache-ttl-days/
  );
});

test("accepts zero to disable Top N and cache reuse", () => {
  const { args } = parseArgs(["--top", "0", "--cache-ttl-days", "0"]);
  assert.equal(args.top, 0);
  assert.equal(args.cacheTtlDays, 0);
});

test("rejects an unsupported granularity", () => {
  assert.throws(
    () => parseArgs(["--granularity", "weekly"]),
    /Invalid --granularity/
  );
});
