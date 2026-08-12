"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchUsageItems } = require("../src/modules/oci");

test("fetchUsageItems follows OCI pagination and preserves request details", async () => {
  const calls = [];
  const client = {
    async requestSummarizedUsages(request) {
      calls.push(request);
      return request.page
        ? { usageAggregation: { items: [{ id: 2 }] } }
        : { usageAggregation: { items: [{ id: 1 }] }, opcNextPage: "next" };
    },
  };

  assert.deepEqual(await fetchUsageItems(client, { tenantId: "tenant" }), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(calls.map((call) => call.page), [undefined, "next"]);
  assert.ok(calls.every((call) => call.limit === 1000 && call.requestSummarizedUsagesDetails.tenantId === "tenant"));
});

test("fetchUsageItems propagates OCI errors", async () => {
  const expected = new Error("OCI unavailable");
  const client = { requestSummarizedUsages: async () => { throw expected; } };
  await assert.rejects(fetchUsageItems(client, {}), (error) => error === expected);
});
