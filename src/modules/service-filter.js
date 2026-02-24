"use strict";

function serviceMatches(serviceName, wantedService, displayName) {
  if (!wantedService) return true;

  const service = String(serviceName || "").trim().toLowerCase();
  const wanted = String(wantedService || "").trim().toLowerCase();
  const name = String(displayName || "").trim().toLowerCase();

  if (!wanted) return true;

  // Special filter: "oke" means OKE-related Compute/Block resources named "oke-*".
  if (wanted === "oke") {
    const computeOrBlock = service.includes("compute") || service.includes("block storage");
    return computeOrBlock && name.startsWith("oke-");
  }

  return service.includes(wanted);
}

module.exports = { serviceMatches };
