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
  createLoadBalancerClient,
  fetchUsageItems,
  fetchDisplayName,
  fetchResourceDetails,
  fetchBucketTagsFromCli,
  fetchLoadBalancerDisplayName,
} = require("./modules/oci");
const { toIso, withConcurrency } = require("./modules/util");

const NO_TAGS = "__NO_TAGS__";
const DEFAULT_CURRENCY = "EUR";
const DISPLAY_NAME_MAX_LEN = 100;

function isObjectStorageService(service) {
  if (!service) return false;
  const s = String(service).toLowerCase();
  return s.includes("object storage") || s.includes("objectstorage");
}

function isLoadBalancerService(service) {
  if (!service) return false;
  const s = String(service).toLowerCase();
  return s.includes("load balancer");
}

function isLoadBalancerOcid(ocid) {
  if (!ocid) return false;
  return String(ocid).startsWith("ocid1.loadbalancer.");
}

function inferServiceName(service, displayName, resourceId) {
  const original = service || "";
  const serviceLower = String(original).toLowerCase();
  const id = resourceId ? String(resourceId).toLowerCase() : "";
  const name = displayName ? String(displayName).trim() : "";

  const looksLikeContainerRepoName =
    /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/i.test(name);
  const isContainerRepoOcid =
    id.startsWith("ocid1.containerrepo.") || id.startsWith("ocid1.containerimage.");

  if (
    isContainerRepoOcid ||
    (serviceLower.includes("compute") && looksLikeContainerRepoName)
  ) {
    return "Container Registry";
  }

  return original;
}

function formatTags(item) {
  if (!item) return "";
  const parts = [];
  const addTag = (k, v, ns) => {
    const key = k === undefined || k === null ? "" : String(k).trim();
    const val = v === undefined || v === null ? "" : String(v).trim();
    const prefix = ns ? `${String(ns).trim()}.` : "";
    if (key && val) parts.push(`${prefix}${key}=${val}`);
    else if (key) parts.push(`${prefix}${key}`);
    else if (val) parts.push(val);
  };

  if (item.freeformTags && typeof item.freeformTags === "object") {
    for (const [k, v] of Object.entries(item.freeformTags)) {
      addTag(k, v);
    }
  }

  if (item.definedTags && typeof item.definedTags === "object") {
    for (const [ns, tags] of Object.entries(item.definedTags)) {
      if (tags && typeof tags === "object") {
        for (const [k, v] of Object.entries(tags)) {
          addTag(k, v, ns);
        }
      }
    }
  }

  if (item.systemTags && typeof item.systemTags === "object") {
    for (const [ns, tags] of Object.entries(item.systemTags)) {
      if (tags && typeof tags === "object") {
        for (const [k, v] of Object.entries(tags)) {
          addTag(k, v, ns);
        }
      }
    }
  }

  if (Array.isArray(item.tags)) {
    for (const t of item.tags) {
      if (!t) continue;
      if (typeof t === "string") {
        parts.push(t);
        continue;
      }
      if (typeof t === "object") {
        const key = t.key ?? t.name;
        addTag(key, t.value, t.namespace);
      }
    }
  } else if (item.tags && typeof item.tags === "object") {
    for (const [k, v] of Object.entries(item.tags)) {
      addTag(k, v);
    }
  } else if (item.tags && typeof item.tags === "string") {
    parts.push(item.tags);
  }

  if (Array.isArray(item.tag)) {
    for (const t of item.tag) {
      if (!t) continue;
      if (typeof t === "string") parts.push(t);
      else if (typeof t === "object") addTag(t.key ?? t.name, t.value, t.namespace);
    }
  } else if (item.tag && typeof item.tag === "object") {
    for (const [k, v] of Object.entries(item.tag)) {
      addTag(k, v);
    }
  } else if (item.tag && typeof item.tag === "string") {
    parts.push(item.tag);
  }

  const details = item.additionalDetails;
  if (details && typeof details === "object") {
    if (details.freeformTags && typeof details.freeformTags === "object") {
      for (const [k, v] of Object.entries(details.freeformTags)) addTag(k, v);
    }
    if (details.definedTags && typeof details.definedTags === "object") {
      for (const [ns, tags] of Object.entries(details.definedTags)) {
        if (tags && typeof tags === "object") {
          for (const [k, v] of Object.entries(tags)) addTag(k, v, ns);
        }
      }
    }
    if (details.systemTags && typeof details.systemTags === "object") {
      for (const [ns, tags] of Object.entries(details.systemTags)) {
        if (tags && typeof tags === "object") {
          for (const [k, v] of Object.entries(tags)) addTag(k, v, ns);
        }
      }
    }
    if (details.tags !== undefined) {
      parts.push(formatTags({ tags: details.tags }));
    }
    if (details.tag !== undefined) {
      parts.push(formatTags({ tag: details.tag }));
    }
  }

  return Array.from(new Set(parts.filter(Boolean))).join(", ");
}

function tagMatches(tagString, wanted) {
  if (!wanted) return true;
  const normalizedWanted = String(wanted).trim().toLowerCase();
  if (normalizedWanted === "notags" || normalizedWanted === "no-tags") {
    return !tagString || !String(tagString).trim();
  }
  if (!tagString) return false;
  const tokens = tagString.split(",").map((t) => t.trim()).filter(Boolean);
  const wantedTokens = wanted.split(",").map((t) => t.trim()).filter(Boolean);
  return wantedTokens.every((w) => tokens.includes(w));
}

function serviceMatches(serviceName, wantedService) {
  if (!wantedService) return true;
  const service = String(serviceName || "").trim().toLowerCase();
  const wanted = String(wantedService || "").trim().toLowerCase();
  if (!wanted) return true;
  return service.includes(wanted);
}

function hasTagData(tagsObj) {
  if (!tagsObj || typeof tagsObj !== "object") return false;
  const blocks = [tagsObj.freeformTags, tagsObj.definedTags, tagsObj.systemTags];
  return blocks.some((block) => block && typeof block === "object" && Object.keys(block).length > 0);
}

function normalizeCurrency(currency) {
  const normalized = currency ? String(currency).trim().toUpperCase() : "";
  return normalized || DEFAULT_CURRENCY;
}

function truncateDisplayName(value) {
  const text = value === undefined || value === null ? "" : String(value);
  if (text.length <= DISPLAY_NAME_MAX_LEN) {
    return text;
  }
  return `${text.slice(0, DISPLAY_NAME_MAX_LEN)}...`;
}

async function main() {
  const settingsPath = path.resolve(__dirname, "../config/settings.json");
  let args;
  let help;
  try {
    ({ args, help } = parseArgs(process.argv.slice(2), settingsPath));
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    printHelp();
    process.exit(1);
  }
  if (help) {
    printHelp();
    process.exit(0);
  }

  const { start, end } = computeRange(args);

  const provider = createProvider(args);
  const tenantId = provider.getTenantId();
  const usageClient = createUsageClient(provider);
  const searchClient = createSearchClient(provider);
  const loadBalancerClient = createLoadBalancerClient(provider);

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

  const currencyIssues = new Map();
  for (const i of items) {
    const normalizedCurrency = normalizeCurrency(i.currency);
    if (normalizedCurrency === DEFAULT_CURRENCY) continue;
    const currencyKey = normalizedCurrency;
    if (!currencyIssues.has(currencyKey)) {
      currencyIssues.set(currencyKey, {
        count: 0,
        services: new Map(),
      });
    }
    const issue = currencyIssues.get(currencyKey);
    issue.count += 1;
    const service = i.service || "(unknown service)";
    issue.services.set(service, (issue.services.get(service) || 0) + 1);
  }

  if (currencyIssues.size > 0) {
    const details = Array.from(currencyIssues.entries()).map(([currency, info]) => {
      const topServices = Array.from(info.services.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([svc, count]) => `${svc} (${count})`)
        .join(", ");
      return `${currency}: ${info.count} row(s)` + (topServices ? ` [services: ${topServices}]` : "");
    });
    console.warn(
      `Warning: non-EUR currency detected; continuing anyway. ${details.join(" | ")}`
    );
  }

  const uniqueResourceIds = Array.from(
    new Set(items.map((i) => i.resourceId).filter((x) => x))
  );
  const resourceInfoById = new Map();
  for (const i of items) {
    if (!i.resourceId) continue;
    if (!resourceInfoById.has(i.resourceId)) {
      resourceInfoById.set(i.resourceId, {
        service: i.service || "",
        resourceName: i.resourceName || i.resourceId || "",
      });
    }
  }

  if (args.refreshCache) {
    try {
      fs.unlinkSync(args.cachePath);
    } catch {}
  }

  const showTags = !!args.showTags;
  const useTagFilter = !!(args.tag && String(args.tag).trim());
  const useServiceFilter = !!(args.service && String(args.service).trim());
  const useSelectionFilter = useTagFilter || useServiceFilter;
  const needTagData = showTags || useTagFilter;
  const wantedTag = useTagFilter ? String(args.tag).trim() : "";
  const wantedService = useServiceFilter ? String(args.service).trim() : "";

  const cache = loadCache(args.cachePath, args.cacheTtlDays);
  const displayNameMap = cache.nameMap;
  const tagMap = cache.tagMap;
  const deletedResourceIds = new Set();

  const toFetch = uniqueResourceIds.filter((ocid) => {
    if (!displayNameMap.has(ocid)) {
      return true;
    }

    if (!needTagData) {
      return false;
    }

    const cachedTag = tagMap.has(ocid) ? tagMap.get(ocid) : undefined;
    if (cachedTag === undefined || cachedTag === "" || cachedTag === null) {
      return true;
    }

    const resourceInfo = resourceInfoById.get(ocid) || {};
    if (cachedTag === NO_TAGS && isObjectStorageService(resourceInfo.service)) {
      return true;
    }

    return false;
  });
  await withConcurrency(toFetch, 5, async (ocid) => {
    const resourceInfo = resourceInfoById.get(ocid) || {};
    try {
      if (needTagData) {
        const details = await fetchResourceDetails(searchClient, ocid);
        if (!details.displayName) {
          deletedResourceIds.add(ocid);
        } else {
          deletedResourceIds.delete(ocid);
        }
        displayNameMap.set(ocid, details.displayName || resourceInfo.resourceName || null);
        let tagDetails = {
          freeformTags: details.freeformTags || null,
          definedTags: details.definedTags || null,
          systemTags: details.systemTags || null,
        };

        if (isObjectStorageService(resourceInfo.service) && !hasTagData(tagDetails)) {
          try {
            const bucketTags = await fetchBucketTagsFromCli(
              { configFile: args.configFile, profile: args.profile },
              details.bucketName || details.displayName || resourceInfo.resourceName,
              details.namespaceName
            );
            if (hasTagData(bucketTags)) {
              tagDetails = bucketTags;
            }
          } catch {
            // Ignore CLI fallback errors and keep existing tag details.
          }
        }

        if (
          details.found &&
          !details.displayName &&
          isLoadBalancerService(resourceInfo.service) &&
          isLoadBalancerOcid(ocid)
        ) {
          try {
            const lbName = await fetchLoadBalancerDisplayName(loadBalancerClient, ocid);
            if (lbName) {
              displayNameMap.set(ocid, lbName);
            }
          } catch {
            // Keep existing fallback name resolution path.
          }
        }

        tagMap.set(ocid, tagDetails);
      } else {
        const name = await fetchDisplayName(searchClient, ocid);
        if (!name) {
          deletedResourceIds.add(ocid);
        } else {
          deletedResourceIds.delete(ocid);
        }
        let resolvedName = name;
        if (
          !resolvedName &&
          isLoadBalancerService(resourceInfo.service) &&
          isLoadBalancerOcid(ocid)
        ) {
          try {
            const details = await fetchResourceDetails(searchClient, ocid);
            if (details.found) {
              resolvedName = await fetchLoadBalancerDisplayName(loadBalancerClient, ocid);
            } else {
              deletedResourceIds.add(ocid);
            }
          } catch {
            // Keep existing fallback name resolution path.
          }
        }
        displayNameMap.set(ocid, resolvedName);
      }
    } catch {
      displayNameMap.set(ocid, null);
      if (needTagData) {
        tagMap.set(ocid, "");
      }
    }
  });

  const tagStringMap = new Map();
  if (needTagData) {
    for (const [ocid, tagObj] of tagMap.entries()) {
      const formatted =
        typeof tagObj === "string" || tagObj === null ? tagObj : formatTags(tagObj);
      tagStringMap.set(ocid, formatted === "" || formatted === null ? NO_TAGS : formatted);
    }
    saveCache(args.cachePath, displayNameMap, tagStringMap);
  } else {
    saveCache(args.cachePath, displayNameMap, tagMap);
  }

  const detailedRows = items
    .map((i) => {
      const tags =
        (needTagData &&
          i.resourceId &&
          tagStringMap.get(i.resourceId) !== NO_TAGS &&
          tagStringMap.get(i.resourceId)) ||
        (needTagData ? formatTags(i) : "");
      const nameFromSearch = i.resourceId ? displayNameMap.get(i.resourceId) : null;
      const displayName =
        i.resourceName ||
        nameFromSearch ||
        (isObjectStorageService(i.service) && i.resourceId
          ? i.resourceId
          : "(name not found)");
      const displayNameWithStatus =
        i.resourceId && deletedResourceIds.has(i.resourceId)
          ? `${displayName} (deleted)`
          : displayName;
      return {
        amount: Number(i.computedAmount || 0),
        currency: normalizeCurrency(i.currency),
        service: inferServiceName(i.service || "", displayNameWithStatus, i.resourceId),
        displayName: truncateDisplayName(displayNameWithStatus),
        tags,
      };
    })
    .filter((r) => r.amount !== 0)
    .filter((r) => (useTagFilter ? tagMatches(r.tags, wantedTag) : true))
    .filter((r) => (useServiceFilter ? serviceMatches(r.service, wantedService) : true));

  const rows = detailedRows
    .sort((a, b) => b.amount - a.amount)
    .slice(
      0,
      useTagFilter
        ? undefined
        : Number.isFinite(args.top) && args.top > 0
          ? args.top
          : undefined
    )
    .map((r) => {
      const row = {
        kosten: formatMoney(r.amount, r.currency),
        displayName: r.displayName,
        service: r.service,
      };
      if (showTags) {
        row.tags = r.tags || "";
      }
      return row;
    });

  if (useTagFilter && detailedRows.length === 0) {
    console.warn(`Warning: no results match tag ${wantedTag}.`);
  }
  if (useServiceFilter && detailedRows.length === 0) {
    console.warn(`Warning: no results match service ${wantedService}.`);
  }

  if (detailedRows.length === 0) {
    console.log("No results for this period.");
    return;
  }

  const totalsByCurrency = new Map();
  const totalsByServiceCurrency = new Map();
  for (const i of items) {
    const currency = normalizeCurrency(i.currency);
    const amount = Number(i.computedAmount || 0);
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + amount);
    const service = i.service || "(unknown)";
    const key = `${service}|||${currency}`;
    totalsByServiceCurrency.set(key, (totalsByServiceCurrency.get(key) || 0) + amount);
  }

  const totalRows = Array.from(totalsByCurrency.entries())
    .filter(([, amount]) => amount !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => ({
      kosten: formatMoney(amount, currency),
      displayName: "Total (all services, not just Top N)",
      service: "",
    }));

  const filteredTotalsByCurrency = new Map();
  for (const r of detailedRows) {
    filteredTotalsByCurrency.set(
      r.currency,
      (filteredTotalsByCurrency.get(r.currency) || 0) + r.amount
    );
  }

  const filteredTotalRows = useSelectionFilter
    ? Array.from(filteredTotalsByCurrency.entries())
        .filter(([, amount]) => amount !== 0)
        .sort((a, b) => b[1] - a[1])
        .map(([currency, amount]) => ({
          kosten: formatMoney(amount, currency),
          displayName: (() => {
            const allAmount = totalsByCurrency.get(currency) || 0;
            const pct = allAmount !== 0 ? (amount / allAmount) * 100 : 0;
            return `Total (filtered selection, not just Top N) (${pct.toFixed(2)}%)`;
          })(),
          service: "",
        }))
    : [];

  const rowsWithTotal = rows.concat(filteredTotalRows, totalRows);
  const totalsByService = new Map();
  for (const [key, amount] of totalsByServiceCurrency.entries()) {
    const [service] = key.split("|||");
    totalsByService.set(service, (totalsByService.get(service) || 0) + amount);
  }

  const serviceTotalsRows = Array.from(totalsByService.entries())
    .filter(([, amount]) => amount !== 0)
    .map(([service, amount]) => ({
      amount,
      kosten: formatMoney(amount, DEFAULT_CURRENCY),
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
