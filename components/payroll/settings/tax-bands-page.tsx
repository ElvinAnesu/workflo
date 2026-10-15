"use client";

import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import {
  calculatePaye,
  validateTaxBands,
} from "@/components/payroll/payroll-engine";
import { formatMoney, parseAmount } from "@/components/payroll/payroll-format";
import { useRouter } from "next/navigation";
import { saveTaxBandsAction } from "@/app/(app)/settings/payroll-actions";
import type { TaxBand } from "@/components/payroll/payroll.types";

// Each row stores its upper limit and rate; the lower limit is always the
// previous row's upper limit, so bands can never have gaps or overlaps.
type DraftRow = { to: string; rate: string };

function toDraft(bands: TaxBand[]): DraftRow[] {
  return [...bands]
    .sort((a, b) => a.from - b.from)
    .map((band) => ({
      to: band.to === null ? "" : String(band.to),
      rate: String(band.rate),
    }));
}

function toBands(rows: DraftRow[]): TaxBand[] {
  let from = 0;
  return rows.map((row, index) => {
    const isLast = index === rows.length - 1;
    const to = isLast ? null : parseAmount(row.to);
    const band: TaxBand = {
      id: String(index),
      from,
      to,
      rate: parseAmount(row.rate),
    };
    from = to ?? from;
    return band;
  });
}

export function TaxBandsPage({ taxBands }: { taxBands: TaxBand[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [testIncome, setTestIncome] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);

  const rows = draft ?? toDraft(taxBands);
  const bands = toBands(rows);
  // Check rows in the order shown first, so a mistake is reported on the
  // row the user typed it in rather than after the bands are re-sorted.
  const rowErrors = bands.flatMap((band, index) => {
    const label = `Band ${index + 1}`;
    if (band.to !== null && !Number.isFinite(band.to)) {
      return [`${label}: "up to" must be a number.`];
    }
    if (band.to !== null && band.to <= band.from) {
      return [`${label}: "up to" must be more than ${formatMoney(band.from)}.`];
    }
    return [];
  });
  const errors =
    rows.length === 0 ? [] : rowErrors.length > 0 ? rowErrors : validateTaxBands(bands);
  const isConfigured = validateTaxBands(taxBands).length === 0;
  const dirty = draft !== null;

  const income = parseAmount(testIncome);
  const canTest = errors.length === 0 && rows.length > 0 && income > 0;

  function update(next: DraftRow[]) {
    setDraft(next);
    setSavedMessage(false);
  }

  function updateRow(index: number, key: keyof DraftRow, value: string) {
    update(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addBand() {
    if (rows.length === 0) {
      update([{ to: "", rate: "0" }]);
      return;
    }
    // Insert a new band just before the open-ended top band.
    update([...rows.slice(0, -1), { to: "", rate: "" }, rows[rows.length - 1]]);
  }

  function removeBand(index: number) {
    update(rows.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const result = await saveTaxBandsAction(
      bands.map((band) => ({ from: band.from, to: band.to, rate: band.rate })),
    );
    if ("error" in result && result.error) {
      return;
    }
    setDraft(null);
    setSavedMessage(true);
    router.refresh();
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold text-zinc-800">
            PAYE tax bands
          </h1>
          <p className="max-w-2xl text-xs text-zinc-500">
            Monthly progressive bands. Income in each band is taxed at that
            band&apos;s rate. Enter them exactly as published by the tax
            authority; payroll cannot run until bands are saved.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isConfigured
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {isConfigured ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <AlertTriangle className="size-3.5" />
          )}
          {isConfigured ? "Configured" : "Not configured"}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200">
        <table className="min-w-full border-collapse">
          <thead className="bg-zinc-50">
            <tr>
              {["Band", "Income from", "Income up to", "Rate (%)", ""].map(
                (label) => (
                  <th
                    key={label}
                    scope="col"
                    className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500"
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isLast = index === rows.length - 1;
              return (
                <tr key={index} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-xs text-zinc-500">{index + 1}</td>
                  <td className="px-3 py-2 text-xs text-zinc-700 tabular-nums">
                    {Number.isFinite(bands[index].from)
                      ? formatMoney(bands[index].from)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {isLast ? (
                      <span className="text-xs text-zinc-500">and above</span>
                    ) : (
                      <input
                        inputMode="decimal"
                        aria-label={`Band ${index + 1} upper limit`}
                        value={row.to}
                        onChange={(event) =>
                          updateRow(index, "to", event.target.value)
                        }
                        className={`${formControlClass} w-40`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="decimal"
                      aria-label={`Band ${index + 1} rate`}
                      value={row.rate}
                      onChange={(event) =>
                        updateRow(index, "rate", event.target.value)
                      }
                      className={`${formControlClass} w-24`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remove band ${index + 1}`}
                      onClick={() => removeBand(index)}
                      className="inline-flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="border-t border-zinc-200 px-3 py-10 text-center text-xs text-zinc-500">
            No tax bands yet. Add the first band, starting from 0.
          </p>
        ) : null}
      </div>

      {errors.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addBand} className={secondaryButtonClass}>
          <Plus className="size-4" />
          Add band
        </button>
        <div className="ml-auto flex items-center gap-2">
          {savedMessage ? (
            <span className="text-xs text-emerald-700">Saved</span>
          ) : null}
          {dirty ? (
            <button
              type="button"
              onClick={() => setDraft(null)}
              className={secondaryButtonClass}
            >
              Discard changes
            </button>
          ) : null}
          <button
            type="button"
            disabled={!dirty || errors.length > 0 || rows.length === 0}
            onClick={() => {
              void handleSave();
            }}
            className={primaryButtonClass}
          >
            Save bands
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">Check a figure</h2>
          <p className="text-xs text-zinc-500">
            Enter a monthly taxable income to see the PAYE these bands produce.
          </p>
        </div>
        <input
          inputMode="decimal"
          placeholder="Taxable income"
          value={testIncome}
          onChange={(event) => setTestIncome(event.target.value)}
          className={`${formControlClass} w-56`}
        />
        {canTest ? (
          <table className="w-full max-w-xl border-collapse text-xs">
            <tbody>
              {bands.map((band, index) => {
                const upper = band.to ?? Number.POSITIVE_INFINITY;
                const portion = Math.max(0, Math.min(income, upper) - band.from);
                return (
                  <tr key={index} className="border-b border-zinc-100">
                    <td className="py-1.5 text-zinc-600">
                      {formatMoney(band.from)} –{" "}
                      {band.to === null ? "above" : formatMoney(band.to)} @{" "}
                      {band.rate}%
                    </td>
                    <td className="py-1.5 text-right text-zinc-500 tabular-nums">
                      {formatMoney(portion)}
                    </td>
                    <td className="py-1.5 text-right text-zinc-800 tabular-nums">
                      {formatMoney((portion * band.rate) / 100)}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-2 font-semibold text-zinc-800">PAYE</td>
                <td />
                <td className="py-2 text-right font-semibold text-zinc-900 tabular-nums">
                  {formatMoney(calculatePaye(income, bands))}
                </td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}
