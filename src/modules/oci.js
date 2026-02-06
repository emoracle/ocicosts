"use strict";

const common = require("oci-common");
const usageapi = require("oci-usageapi");
const resourcesearch = require("oci-resourcesearch");

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
  if (!item) return { freeformTags: null, definedTags: null };
  return {
    freeformTags: item.freeformTags || null,
    definedTags: item.definedTags || null,
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
  if (items.length === 0) return { displayName: null, freeformTags: null, definedTags: null };
  const item = items[0];
  return {
    displayName: extractBestName(item),
    ...extractTags(item),
  };
}

module.exports = {
  createProvider,
  createUsageClient,
  createSearchClient,
  fetchUsageItems,
  fetchDisplayName,
  fetchResourceDetails,
};
