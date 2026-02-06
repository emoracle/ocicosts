#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const { parseArgs, printHelp } = require("./modules/args");
const { computeRange } = require("./modules/time");
const { loadCache, saveCache } = require("./modules/cache");
const { writeCsv, writeCsvFile, writeCsvAppend } = require("./modules/csv");
const { formatMoney, renderTable } = require("./modules/format");
const {
  createProvider,
  createUsageClient,
  createSearchClient,
  fetchUsageItems,
  fetchDisplayName,
  fetchResourceDetails,
} = require("./modules/oci");
const { toIso, withConcurrency } = require("./modules/util");

function isObjectStorageService(service) {
  if (!service) return false;
  const s = String(service).toLowerCase();
  return s.includes("object storage") || s.includes("objectstorage");
}

function formatTags(item) {
  if (!item) return "";
  const parts = [];

  if (item.freeformTags && typeof item.freeformTags === "object") {
    for (const [k, v] of Object.entries(item.freeformTags)) {
      parts.push(`${k}=${v}`);
    }
  }

  if (item.definedTags && typeof item.definedTags === "object") {
    for (const [ns, tags] of Object.entries(item.definedTags)) {
      if (tags && typeof tags === "object") {
        for (const [k, v] of Object.entries(tags)) {
          parts.push(`${ns}.${k}=${v}`);
        }
      }
    }
  }

  if (item.tags && typeof item.tags === "string") {
    parts.push(item.tags);
  }

  if (item.tag && typeof item.tag === "string") {
    parts.push(item.tag);
  }

  return parts.join(", ");
}

function tagMatches(tagString, wanted) {
  if (!wanted) return true;
  if (!tagString) return false;
  const tokens = tagString.split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.includes(wanted);
}

async function main() {
  const settingsPath = path.resolve(__dirname, "../config/settings.json");
  const { args, help } = parseArgs(process.argv.slice(2), settingsPath);
  if (help) {
    printHelp();
    process.exit(0);
  }

  const { start, end } = computeRange(args);

  const provider = createProvider(args);
  const tenantId = provider.getTenantId();
  const usageClient = createUsageClient(provider);
  const searchClient = createSearchClient(provider);

  const groupBy = ["resourceId", "service", "compartmentName"];

  const requestDetails = {
    tenantId,
    timeUsageStarted: toIso(start),
    timeUsageEnded: toIso(end),
    granularity: args.granularity,
    queryType: "COST",
    isAggregateByTime: true,
    groupBy,
    compartmentDepth: args.compartmentDepth,
  };

  const items = await fetchUsageItems(usageClient, requestDetails);

  const uniqueResourceIds = Array.from(
    new Set(items.map((i) => i.resourceId).filter((x) => x))
  );

  if (args.refreshCache) {
    try {
      fs.unlinkSync(args.cachePath);
    } catch {}
  }

  const useTags = !!(args.tag && String(args.tag).trim());
  const wantedTag = useTags ? String(args.tag).trim() : "";

  const cache = loadCache(args.cachePath, args.cacheTtlDays);
  const displayNameMap = cache.nameMap;
  const tagMap = cache.tagMap;

  const toFetch = uniqueResourceIds.filter(
    (ocid) =>
      !displayNameMap.has(ocid) ||
      (useTags && !tagMap.has(ocid))
  );
  await withConcurrency(toFetch, 5, async (ocid) => {
    try {
      if (useTags) {
        const details = await fetchResourceDetails(searchClient, ocid);
        displayNameMap.set(ocid, details.displayName);
        tagMap.set(ocid, {
          freeformTags: details.freeformTags || null,
          definedTags: details.definedTags || null,
        });
      } else {
        const name = await fetchDisplayName(searchClient, ocid);
        displayNameMap.set(ocid, name);
      }
    } catch {
      displayNameMap.set(ocid, null);
      if (useTags) {
        tagMap.set(ocid, "");
      }
    }
  });

  const tagStringMap = new Map();
  if (useTags) {
    for (const [ocid, tagObj] of tagMap.entries()) {
      if (typeof tagObj === "string") {
        tagStringMap.set(ocid, tagObj);
      } else {
        tagStringMap.set(ocid, formatTags(tagObj));
      }
    }
    saveCache(args.cachePath, displayNameMap, tagStringMap);
  } else {
    saveCache(args.cachePath, displayNameMap, tagMap);
  }

  const rows = items
    .map((i) => {
      const tags =
        (useTags && i.resourceId && tagStringMap.get(i.resourceId)) ||
        (useTags ? formatTags(i) : "");
      const nameFromSearch = i.resourceId ? displayNameMap.get(i.resourceId) : null;
      const displayName =
        i.resourceName ||
        nameFromSearch ||
        (isObjectStorageService(i.service) && i.resourceId
          ? i.resourceId
          : "(name not found)");
      return {
        amount: Number(i.computedAmount || 0),
        currency: i.currency || "",
        service: i.service || "",
        displayName,
        tags,
      };
    })
    .filter((r) => (useTags ? tagMatches(r.tags, wantedTag) : true))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, Number.isFinite(args.top) && args.top > 0 ? args.top : undefined)
    .map((r) => ({
      kosten: formatMoney(r.amount, r.currency),
      displayName: r.displayName,
      service: r.service,
    }));

  if (rows.length === 0) {
    console.log("No results for this period.");
    return;
  }

  const totalsByCurrency = new Map();
  const totalsByServiceCurrency = new Map();
  for (const i of items) {
    const currency = i.currency || "";
    const amount = Number(i.computedAmount || 0);
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + amount);
    const service = i.service || "(unknown)";
    const key = `${service}|||${currency}`;
    totalsByServiceCurrency.set(key, (totalsByServiceCurrency.get(key) || 0) + amount);
  }

  const totalRows = Array.from(totalsByCurrency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => ({
      kosten: formatMoney(amount, currency),
      displayName: "Total (all services, not just Top N)",
      service: "",
    }));

  const rowsWithTotal = rows.concat(totalRows);
  const totalsByService = new Map();
  for (const [key, amount] of totalsByServiceCurrency.entries()) {
    const [service] = key.split("|||");
    totalsByService.set(service, (totalsByService.get(service) || 0) + amount);
  }

  const serviceTotalsRows = Array.from(totalsByService.entries())
    .map(([service, amount]) => ({
      amount,
      kosten: formatMoney(amount, "EUR"),
      displayName: "",
      service,
    }))
    .sort((a, b) => b.amount - a.amount)
    .map(({ amount, ...rest }) => rest);

  const topLabel =
    Number.isFinite(args.top) && args.top > 0 ? `Top ${args.top}` : "All";
  const periodLine = `Period: ${toIso(start)} to ${toIso(end)} (${topLabel})`;

  if (args.csv || args.csvFile) {
    if (args.csvFile) {
      writeCsvFile(rowsWithTotal, args.csvFile, periodLine, "Details");
      writeCsvAppend(serviceTotalsRows, args.csvFile, "Total per service");
    }
    if (args.csv) {
      writeCsv(rowsWithTotal, process.stdout, periodLine, "Details");
      writeCsv(serviceTotalsRows, process.stdout, null, "Total per service");
    }
    if (!args.csv && args.csvFile) {
      console.log(`CSV written to ${args.csvFile}`);
    }
    return;
  }

  console.log(periodLine);
  console.log(renderTable(rowsWithTotal));
  console.log("");
  console.log("Total per service");
  console.log(renderTable(serviceTotalsRows));
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
