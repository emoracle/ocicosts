"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { selectDetailRows } = require("../src/modules/row-selection");

const rows = [
  { amount: 10, name: "small" },
  { amount: 30, name: "large" },
  { amount: 20, name: "medium" },
];

test("applies Top N without a selection filter", () => {
  assert.deepEqual(
    selectDetailRows(rows, 2, false).map((row) => row.name),
    ["large", "medium"]
  );
});

test("does not apply Top N when a service or tag selection is active", () => {
  assert.deepEqual(
    selectDetailRows(rows, 2, true).map((row) => row.name),
    ["large", "medium", "small"]
  );
});

test("returns all sorted rows when Top N is disabled", () => {
  assert.deepEqual(
    selectDetailRows(rows, 0, false).map((row) => row.name),
    ["large", "medium", "small"]
  );
});
