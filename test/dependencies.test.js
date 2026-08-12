"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const lockfile = require("../package-lock.json");

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }

  return true;
}

function installedVersions(packageName) {
  const suffix = `node_modules/${packageName}`;
  return Object.entries(lockfile.packages)
    .filter(([packagePath]) => packagePath === suffix || packagePath.endsWith(`/${suffix}`))
    .map(([, metadata]) => metadata.version);
}

test("all installed OCI Common versions include the uuid security fix", () => {
  const versions = installedVersions("oci-common");

  assert.ok(versions.length > 0, "oci-common must be installed");
  for (const version of versions) {
    assert.equal(
      versionAtLeast(version, "2.139.1"),
      true,
      `oci-common ${version} is below the safe version 2.139.1`
    );
  }
});

test("all installed uuid versions include the buffer bounds fix", () => {
  const versions = installedVersions("uuid");

  assert.ok(versions.length > 0, "uuid must be installed through the OCI SDK");
  for (const version of versions) {
    assert.equal(
      versionAtLeast(version, "11.1.1"),
      true,
      `uuid ${version} is below the safe version 11.1.1`
    );
  }
});

test("the vulnerable full lodash package is absent", () => {
  assert.deepEqual(installedVersions("lodash"), []);
});
