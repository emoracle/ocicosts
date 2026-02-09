"use strict";

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "-";
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function renderTable(rows) {
  const includeTags = rows.some((r) =>
    Object.prototype.hasOwnProperty.call(r, "tags")
  );
  const headers = includeTags
    ? ["Cost", "DisplayName", "Service", "Tags"]
    : ["Cost", "DisplayName", "Service"];
  const lines = rows.map((r) =>
    includeTags
      ? [r.kosten, r.displayName, r.service, r.tags || ""]
      : [r.kosten, r.displayName, r.service]
  );

  const widths = headers.map((h, idx) =>
    Math.max(h.length, ...lines.map((l) => String(l[idx]).length))
  );

  const renderRow = (cols) =>
    cols
      .map((c, i) => String(c).padEnd(widths[i]))
      .join("  ")
      .trimEnd();

  const output = [];
  output.push(renderRow(headers));
  output.push(renderRow(headers.map((_, i) => "-".repeat(widths[i]))));
  for (const line of lines) output.push(renderRow(line));
  return output.join("\n");
}

module.exports = { formatMoney, renderTable };
