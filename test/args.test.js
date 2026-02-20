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
