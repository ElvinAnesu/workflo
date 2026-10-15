// Builds a CSV that Excel opens directly (UTF-8 with BOM) and downloads it.

type Cell = string | number;

function escapeCell(value: Cell) {
  const text = typeof value === "number" ? String(value) : value;
  // Neutralise spreadsheet formula injection from user-entered text.
  const safe = typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Cell[][]) {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  const blob = new Blob(["﻿", toCsv(headers, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
