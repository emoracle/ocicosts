"use strict";

const common = require("oci-common");
const usageapi = require("oci-usageapi");
const resourcesearch = require("oci-resourcesearch");
const { execFile } = require("child_process");

const CLI_MAX_CONCURRENCY = 1;
const CLI_MAX_ATTEMPTS = 3;

let activeCliCalls = 0;
const cliQueue = [];
const namespacePromiseByProfile = new Map();

function createProvider(args) {
  return new common.ConfigFileAuthenticationDetailsProvider(
    args.configFile,
    args.profile
  );
}

function createUsageClient(provider) {
  return new usageapi.UsageapiClient({ authenticationDetailsProvider: provider });
}

function createSearchClient(provider) {
  return new resourcesearch.ResourceSearchClient({
    authenticationDetailsProvider: provider,
  });
}

async function fetchUsageItems(usageClient, requestDetails) {
  let page;
  const items = [];
  do {
    const response = await usageClient.requestSummarizedUsages({
      requestSummarizedUsagesDetails: requestDetails,
      page,
      limit: 1000,
    });

    const agg = response.usageAggregation || response.data || response;
    const batch = agg.items || [];
    items.push(...batch);
    page = response.opcNextPage || agg.opcNextPage;
  } while (page);
  return items;
}

function extractBestName(item) {
  if (!item) return null;
  if (item.displayName) return item.displayName;
  const details = item.additionalDetails || {};
  return (
    details.bucketName ||
    details.name ||
    details.bucket ||
    details.objectName ||
    item.resourceName ||
    null
  );
}

function extractTags(item) {
  if (!item) return { freeformTags: null, definedTags: null, systemTags: null };
  const details = item.additionalDetails || {};
  return {
    freeformTags: item.freeformTags || details.freeformTags || null,
    definedTags: item.definedTags || details.definedTags || null,
    systemTags: item.systemTags || details.systemTags || null,
  };
}

function extractBucketContext(item) {
  const details = (item && item.additionalDetails) || {};
  return {
    bucketName:
      details.bucketName ||
      details.bucket ||
      item.displayName ||
      item.resourceName ||
      null,
    namespaceName: details.namespaceName || details.namespace || null,
  };
}

function runWithCliConcurrency(task) {
  return new Promise((resolve, reject) => {
    const start = () => {
      activeCliCalls += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activeCliCalls -= 1;
          const next = cliQueue.shift();
          if (next) next();
        });
    };

    if (activeCliCalls < CLI_MAX_CONCURRENCY) {
      start();
    } else {
      cliQueue.push(start);
    }
  });
}

function runOciCli(args) {
  return runWithCliConcurrency(
    () =>
      new Promise((resolve, reject) => {
        execFile("oci", args, { encoding: "utf8" }, (err, stdout, stderr) => {
          if (err) {
            err.stderr = stderr;
            reject(err);
            return;
          }
          resolve(stdout);
        });
      })
  );
}

function isRetryableCliError(error) {
  const text = `${(error && error.message) || ""} ${(error && error.stderr) || ""}`.toLowerCase();
  return (
    text.includes("too many requests") ||
    text.includes("rate") ||
    text.includes("throttl") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("temporar") ||
    text.includes("connection reset") ||
    text.includes("try again")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOciCliWithRetry(args, maxAttempts = CLI_MAX_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runOciCli(args);
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < maxAttempts && isRetryableCliError(error);
      if (!shouldRetry) {
        throw error;
      }
      await sleep(attempt * 200);
    }
  }
  throw lastError;
}

function appendCommonCliArgs(args, commonArgs) {
  if (commonArgs && commonArgs.configFile) {
    args.push("--config-file", commonArgs.configFile);
  }
  if (commonArgs && commonArgs.profile) {
    args.push("--profile", commonArgs.profile);
  }
  return args;
}

function parseBucketIdentifier(bucketName, namespaceName) {
  const rawBucket = bucketName ? String(bucketName).trim() : "";
  const rawNamespace = namespaceName ? String(namespaceName).trim() : "";
  if (!rawBucket) return { bucketName: null, namespaceName: rawNamespace || null };

  if (!rawNamespace && rawBucket.includes("/")) {
    const [maybeNamespace, ...rest] = rawBucket.split("/");
    const bucket = rest.join("/").trim();
    if (maybeNamespace && bucket) {
      return { bucketName: bucket, namespaceName: maybeNamespace.trim() };
    }
  }

  return { bucketName: rawBucket, namespaceName: rawNamespace || null };
}

function getNamespaceCacheKey(commonArgs) {
  const configFile = commonArgs && commonArgs.configFile ? String(commonArgs.configFile) : "";
  const profile = commonArgs && commonArgs.profile ? String(commonArgs.profile) : "";
  return `${configFile}::${profile}`;
}

async function fetchObjectStorageNamespace(commonArgs) {
  const key = getNamespaceCacheKey(commonArgs);
  if (namespacePromiseByProfile.has(key)) {
    return namespacePromiseByProfile.get(key);
  }

  const namespacePromise = (async () => {
    const args = appendCommonCliArgs(["os", "ns", "get"], commonArgs);
    const raw = await runOciCliWithRetry(args);
    const parsed = JSON.parse(raw);
    return (parsed && parsed.data ? String(parsed.data) : "").trim() || null;
  })();

  namespacePromiseByProfile.set(key, namespacePromise);

  try {
    return await namespacePromise;
  } catch (error) {
    namespacePromiseByProfile.delete(key);
    throw error;
  }
}

async function fetchBucketTagsFromCli(commonArgs, bucketName, namespaceName) {
  const bucketRef = parseBucketIdentifier(bucketName, namespaceName);
  if (!bucketRef.bucketName) return { freeformTags: null, definedTags: null, systemTags: null };
  const ns = bucketRef.namespaceName || (await fetchObjectStorageNamespace(commonArgs));
  if (!ns) return { freeformTags: null, definedTags: null, systemTags: null };

  const args = appendCommonCliArgs(
    ["os", "bucket", "get", "--namespace-name", ns, "--name", bucketRef.bucketName],
    commonArgs
  );
  const raw = await runOciCliWithRetry(args);
  const parsedJson = JSON.parse(raw);
  const data = parsedJson && parsedJson.data ? parsedJson.data : {};
  return {
    freeformTags: data["freeform-tags"] || null,
    definedTags: data["defined-tags"] || null,
    systemTags: data["system-tags"] || null,
  };
}

async function fetchDisplayName(searchClient, ocid) {
  const query = `query all resources where identifier = '${ocid}'`;
  const searchDetails = { type: "Structured", query };
  const response = await searchClient.searchResources({ searchDetails });

  const collection =
    response.resourceSummaryCollection ||
    response.resourceSummaryCollectionSummary ||
    response.data ||
    response;

  const items = collection.items || [];
  if (items.length === 0) return null;
  return extractBestName(items[0]);
}

async function fetchResourceDetails(searchClient, ocid) {
  const query = `query all resources where identifier = '${ocid}'`;
  const searchDetails = { type: "Structured", query };
  const response = await searchClient.searchResources({ searchDetails });

  const collection =
    response.resourceSummaryCollection ||
    response.resourceSummaryCollectionSummary ||
    response.data ||
    response;

  const items = collection.items || [];
  if (items.length === 0) {
    return {
      displayName: null,
      freeformTags: null,
      definedTags: null,
      systemTags: null,
      bucketName: null,
      namespaceName: null,
    };
  }
  const item = items[0];
  return {
    displayName: extractBestName(item),
    ...extractTags(item),
    ...extractBucketContext(item),
  };
}

module.exports = {
  createProvider,
  createUsageClient,
  createSearchClient,
  fetchUsageItems,
  fetchDisplayName,
  fetchResourceDetails,
  fetchBucketTagsFromCli,
};
