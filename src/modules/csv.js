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
  if (periodLine) {
    stream.write(`# ${periodLine}\n`);
  }
  if (sectionLabel) {
    stream.write(`# ${sectionLabel}\n`);
  }
  const headers = ["Cost", "DisplayName", "Service"];
  stream.write(headers.map(csvEscape).join(",") + "\n");
  for (const r of rows) {
    const line = [r.kosten, r.displayName, r.service];
    stream.write(line.map(csvEscape).join(",") + "\n");
  }
}

function writeCsvFile(rows, filePath, periodLine, sectionLabel) {
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
  writeCsv(rows, stream, periodLine, sectionLabel);
  stream.end();
}

function writeCsvAppend(rows, filePath, sectionLabel) {
  const stream = fs.createWriteStream(filePath, { encoding: "utf8", flags: "a" });
  writeCsv(rows, stream, null, sectionLabel);
  stream.end();
}

module.exports = { writeCsv, writeCsvFile, writeCsvAppend };
