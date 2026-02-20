"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeRange } = require("../src/modules/time");

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

test("uses today as default end when only --start is provided (DAILY)", () => {
  const before = new Date();
  const result = computeRange({ start: "2026-02-01", granularity: "DAILY" });
  const after = new Date();

  assert.equal(result.start.toISOString(), "2026-02-01T00:00:00.000Z");

  const expectedCandidates = [
    new Date(startOfUtcDay(before).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    new Date(startOfUtcDay(after).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  ];

  assert.ok(
    expectedCandidates.includes(result.end.toISOString()),
    `Unexpected end value: ${result.end.toISOString()}`
  );
});

test("uses Jan 1 of end year as default start when only --end is provided", () => {
  const result = computeRange({ end: "2026-02-10", granularity: "DAILY" });

  assert.equal(result.start.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(result.end.toISOString(), "2026-02-11T00:00:00.000Z");
});

test("uses provided start/end when both are present", () => {
  const result = computeRange({
    start: "2026-02-01",
    end: "2026-02-06",
    granularity: "DAILY",
  });

  assert.equal(result.start.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(result.end.toISOString(), "2026-02-07T00:00:00.000Z");
});

test("throws on invalid --start", () => {
  assert.throws(
    () => computeRange({ start: "not-a-date", granularity: "DAILY" }),
    /Invalid --start/
  );
});
