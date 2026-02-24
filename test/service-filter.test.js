"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { serviceMatches } = require("../src/modules/service-filter");

test("matches generic service substring", () => {
  assert.equal(serviceMatches("Load Balancer", "load", "lb-main"), true);
  assert.equal(serviceMatches("Object Storage", "load", "bucket-a"), false);
});

test("matches --service oke only for Compute/Block Storage with oke- prefix", () => {
  assert.equal(serviceMatches("Compute", "oke", "oke-node-1"), true);
  assert.equal(serviceMatches("Block Storage", "oke", "oke-vol-1"), true);
  assert.equal(serviceMatches("Compute", "oke", "prod-node-1"), false);
  assert.equal(serviceMatches("Load Balancer", "oke", "oke-lb"), false);
  assert.equal(serviceMatches("Block Storage", "oke", "OKE-data"), true);
});
