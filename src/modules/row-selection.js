"use strict";

function selectDetailRows(rows, top, hasSelectionFilter) {
  const sortedRows = [...rows].sort((a, b) => b.amount - a.amount);

  if (hasSelectionFilter || !Number.isFinite(top) || top <= 0) {
    return sortedRows;
  }

  return sortedRows.slice(0, top);
}

module.exports = { selectDetailRows };
