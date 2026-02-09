"use strict";

const fs = require("fs");

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes("\"") || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/\"/g, "\"\"")}"`;
  }
  return s;
}

function writeCsv(rows, stream, periodLine, sectionLabel) {
  const includeTags = rows.some((r) =>
    Object.prototype.hasOwnProperty.call(r, "tags")
  );
  if (periodLine) {
    stream.write(`# ${periodLine}\n`);
  }
  if (sectionLabel) {
    stream.write(`# ${sectionLabel}\n`);
  }
  const headers = includeTags
    ? ["Cost", "DisplayName", "Service", "Tags"]
    : ["Cost", "DisplayName", "Service"];
  stream.write(headers.map(csvEscape).join(",") + "\n");
  for (const r of rows) {
    const line = includeTags
      ? [r.kosten, r.displayName, r.service, r.tags || ""]
      : [r.kosten, r.displayName, r.service];
    stream.write(line.map(csvEscape).join(",") + "\n");
  }
}

function buildCsv(rows, periodLine, sectionLabel) {
  const includeTags = rows.some((r) =>
    Object.prototype.hasOwnProperty.call(r, "tags")
  );
  const lines = [];
  if (periodLine) {
    lines.push(`# ${periodLine}`);
  }
  if (sectionLabel) {
    lines.push(`# ${sectionLabel}`);
  }
  const headers = includeTags
    ? ["Cost", "DisplayName", "Service", "Tags"]
    : ["Cost", "DisplayName", "Service"];
  lines.push(headers.map(csvEscape).join(","));
  for (const r of rows) {
    const line = includeTags
      ? [r.kosten, r.displayName, r.service, r.tags || ""]
      : [r.kosten, r.displayName, r.service];
    lines.push(line.map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

function writeCsvFile(rows, filePath, periodLine, sectionLabel) {
  fs.writeFileSync(filePath, buildCsv(rows, periodLine, sectionLabel), "utf8");
}

function writeCsvAppend(rows, filePath, sectionLabel) {
  fs.appendFileSync(filePath, buildCsv(rows, null, sectionLabel), "utf8");
}

module.exports = { writeCsv, writeCsvFile, writeCsvAppend };
