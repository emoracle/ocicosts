"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDetailedRows,
  buildServiceTotalRows,
  formatTags,
  getTopLabel,
  inferServiceName,
  tagMatches,
} = require("../src/showcosts");
const { formatMoney } = require("../src/modules/format");

test("uses All in the period label whenever a selection filter is active", () => {
  assert.equal(getTopLabel(30, false), "Top 30");
  assert.equal(getTopLabel(30, true), "All");
  assert.equal(getTopLabel(0, false), "All");
});

test("formats and matches freeform and defined tags", () => {
  const tags = formatTags({
    freeformTags: { Team: "Platform" },
    definedTags: { Finance: { CostCenter: "42" } },
  });
  assert.equal(tags, "Team=Platform, Finance.CostCenter=42");
  assert.equal(tagMatches(tags, "Team=Platform,Finance.CostCenter=42"), true);
  assert.equal(tagMatches("", "notags"), true);
});

test("builds report rows with cache names, deleted status, tags and filters", () => {
  const items = [
    {
      resourceId: "ocid1.instance.a",
      computedAmount: "12.5",
      currency: "eur",
      service: "Compute",
      freeformTags: { Team: "Platform" },
    },
    { resourceId: "ocid1.instance.b", computedAmount: 0, service: "Compute" },
  ];
  const rows = buildDetailedRows(items, {
    needTagData: true,
    tagStringMap: new Map(),
    displayNameMap: new Map([["ocid1.instance.a", "oke-worker"]]),
    deletedResourceIds: new Set(["ocid1.instance.a"]),
    wantedTag: "Team=Platform",
    wantedService: "oke",
  });

  assert.deepEqual(rows, [
    {
      amount: 12.5,
      currency: "EUR",
      service: "Compute",
      rawDisplayName: "oke-worker",
      displayName: "oke-worker (deleted)",
      tags: "Team=Platform",
    },
  ]);
});

test("infers Container Registry from its OCID", () => {
  assert.equal(
    inferServiceName("Compute", "repository", "ocid1.containerrepo.oc1.example"),
    "Container Registry"
  );
});

test("keeps service totals separated by currency", () => {
  const rows = buildServiceTotalRows([
    { service: "Compute", currency: "EUR", computedAmount: 10 },
    { service: "Compute", currency: "eur", computedAmount: 5 },
    { service: "Compute", currency: "USD", computedAmount: 20 },
  ]);

  assert.deepEqual(rows, [
    { kosten: formatMoney(20, "USD"), displayName: "", service: "Compute" },
    { kosten: formatMoney(15, "EUR"), displayName: "", service: "Compute" },
  ]);
});

test("uses EUR for missing currency and omits zero service totals", () => {
  const rows = buildServiceTotalRows([
    { service: "Database", computedAmount: 7.5 },
    { service: "Networking", currency: "USD", computedAmount: 4 },
    { service: "Networking", currency: "USD", computedAmount: -4 },
  ]);

  assert.deepEqual(rows, [
    { kosten: formatMoney(7.5, "EUR"), displayName: "", service: "Database" },
  ]);
});

test("does not collide when service names contain separator-like text", () => {
  const rows = buildServiceTotalRows([
    { service: "Custom|||EUR", currency: "USD", computedAmount: 3 },
    { service: "Custom", currency: "EUR", computedAmount: 2 },
  ]);

  assert.deepEqual(rows.map((row) => row.service), ["Custom|||EUR", "Custom"]);
});
