"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAssignmentAction, getPlanAction, holdEmployeesAction, savePlanAction } from "@/app/(app)/payroll/actions";
import {
  FormDialogFrame,
  FormField,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass, formControlDisabledClass } from "@/components/form/form-control";
import {
  addMonths,
  installmentFor,
  loanTotal,
  monthsToRepay,
} from "@/components/payroll/deduction-plans";
import { formatMoney, parseAmount } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { DeductionPlan, DeductionPlanKind } from "@/components/payroll/payroll.types";
import { PLAN_COPY } from "@/components/payroll/plans/plan-copy";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type PlanFormDialogProps = {
  kind: DeductionPlanKind;
  planId: number | null;
  nextPeriod: string;
  onClose: () => void;
};

function amountText(value: number | undefined) {
  return value ? String(value) : "";
}

export function PlanFormDialog({ kind, planId, nextPeriod, onClose }: PlanFormDialogProps) {
  const router = useRouter();
  const copy = PLAN_COPY[kind];
  const [plan, setPlan] = useState<DeductionPlan | null>(null);
  const [started, setStarted] = useState(false);
  const [employees, setEmployees] = useState<{ id: number; employee_code: string; name: string }[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [months, setMonths] = useState(kind === "Advance" ? "1" : "");
  const [installment, setInstallment] = useState("");
  const [startPeriod, setStartPeriod] = useState(nextPeriod);
  const [basicSalary, setBasicSalary] = useState(0);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [ready, setReady] = useState(planId == null);

  useEffect(() => {
    void holdEmployeesAction().then(setEmployees);
  }, []);

  useEffect(() => {
    if (!planId) {
      return;
    }
    void getPlanAction(planId).then((result) => {
      if ("error" in result) {
        setError(result.error ?? "This record was not found.");
        setReady(true);
        return;
      }
      const loaded = result.plan;
      setPlan(loaded);
      setEmployeeId(loaded.employeeId);
      setCategory(loaded.category);
      setReason(loaded.reason);
      setPrincipal(amountText(loaded.principal));
      setInterestRate(amountText(loaded.interestRate));
      setMonths(String(monthsToRepay(loaded.total, loaded.installment)));
      setInstallment(amountText(loaded.installment));
      setStartPeriod(loaded.startPeriod);
      const recovered = result.balance.recoveredPayroll + result.balance.pendingPayroll + result.balance.repaidManually;
      setStarted(recovered > 0);
      setReady(true);
    });
  }, [planId]);

  useEffect(() => {
    if (!employeeId) {
      setBasicSalary(0);
      return;
    }
    void getAssignmentAction(Number(employeeId)).then((result) => {
      if ("error" in result) {
        setBasicSalary(0);
        return;
      }
      setBasicSalary(result.basicSalary);
    });
  }, [employeeId]);

  const principalValue = parseAmount(principal || "0");
  const rateValue = kind === "Loan" ? parseAmount(interestRate || "0") : 0;
  const total = Number.isFinite(principalValue) && Number.isFinite(rateValue) ? loanTotal(principalValue, rateValue) : 0;
  const installmentValue = parseAmount(installment || "0");
  const deductions = monthsToRepay(total, installmentValue);

  function syncFromMonths(nextTotal: number, nextMonths: string) {
    const count = Number(nextMonths);
    if (count > 0 && nextTotal > 0) {
      setInstallment(String(installmentFor(nextTotal, count)));
    }
  }

  async function handleSubmit() {
    setSubmitted(true);
    if (!Number.isFinite(principalValue) || !Number.isFinite(rateValue) || !Number.isFinite(installmentValue)) {
      setError("Amounts must be numbers.");
      return;
    }
    const result = await savePlanAction({
      id: planId ?? undefined,
      kind,
      employeeId: Number(employeeId),
      category: category.trim(),
      reason: reason.trim(),
      principal: principalValue,
      interestRate: rateValue,
      installment: installmentValue,
      startPeriod,
    });
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <FormDialogFrame
      title={plan ? `Update ${copy.noun} ${plan.id}` : copy.addLabel}
      submitLabel={plan ? "Save" : kind === "Recovery" ? "Start recovery" : "Submit for approval"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      {planId && !ready ? <p className="p-4 text-xs text-zinc-500">Loading…</p> : null}
      {ready ? (
        <div className={sectionGridClass}>
          <FormField label="Employee" className="sm:col-span-2">
            <select
              value={employeeId}
              disabled={Boolean(plan)}
              onChange={(event) => setEmployeeId(event.target.value)}
              className={submitted && !employeeId ? invalidClass : plan ? formControlDisabledClass : formControlClass}
            >
              <option value="">Select</option>
              {employees.map((employee) => (
                <option key={employee.id} value={String(employee.id)}>
                  {employee.employee_code} · {employee.name}
                </option>
              ))}
              {plan && !employees.some((employee) => String(employee.id) === employeeId) ? (
                <option value={employeeId}>{employeeId}</option>
              ) : null}
            </select>
          </FormField>
          {copy.categoryLabel ? (
            <FormField label={copy.categoryLabel} className="sm:col-span-2">
              <input
                list={`${kind}-categories`}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={formControlClass}
              />
              <datalist id={`${kind}-categories`}>
                {copy.categorySuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </FormField>
          ) : (
            <div className="hidden sm:col-span-2 sm:block" />
          )}

          <FormField label={copy.amountLabel} hint={started ? "Deductions have started" : undefined}>
            <input
              inputMode="decimal"
              value={principal}
              disabled={started}
              onChange={(event) => {
                setPrincipal(event.target.value);
                const value = parseAmount(event.target.value || "0");
                syncFromMonths(loanTotal(value, rateValue), months);
              }}
              className={started ? formControlDisabledClass : submitted && !(principalValue > 0) ? invalidClass : formControlClass}
            />
          </FormField>
          {kind === "Loan" ? (
            <>
              <FormField label="Interest (%)" hint="Flat, on the loan amount">
                <input
                  inputMode="decimal"
                  value={interestRate}
                  disabled={started}
                  placeholder="0"
                  onChange={(event) => {
                    setInterestRate(event.target.value);
                    const value = parseAmount(event.target.value || "0");
                    syncFromMonths(loanTotal(principalValue, value), months);
                  }}
                  className={started ? formControlDisabledClass : formControlClass}
                />
              </FormField>
              <FormField label="Total to repay">
                <input readOnly value={formatMoney(total)} className={formControlDisabledClass} />
              </FormField>
            </>
          ) : null}
          <FormField label="Repay over (months)">
            <input
              inputMode="numeric"
              value={months}
              onChange={(event) => {
                setMonths(event.target.value);
                syncFromMonths(total, event.target.value);
              }}
              className={formControlClass}
            />
          </FormField>
          <FormField label="Monthly deduction">
            <input
              inputMode="decimal"
              value={installment}
              onChange={(event) => {
                setInstallment(event.target.value);
                const count = monthsToRepay(total, parseAmount(event.target.value || "0"));
                setMonths(count > 0 ? String(count) : "");
              }}
              className={submitted && !(installmentValue > 0) ? invalidClass : formControlClass}
            />
          </FormField>
          <FormField label="First deduction month">
            <input
              type="month"
              value={startPeriod}
              onChange={(event) => setStartPeriod(event.target.value)}
              className={submitted && !startPeriod ? invalidClass : formControlClass}
            />
          </FormField>
          <FormField label={copy.reasonLabel} className="sm:col-span-4">
            <input value={reason} onChange={(event) => setReason(event.target.value)} className={formControlClass} />
          </FormField>

          {total > 0 && installmentValue > 0 && deductions > 0 && startPeriod ? (
            <div className="flex flex-col gap-1 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 sm:col-span-4">
              <span>
                {deductions} deduction{deductions === 1 ? "" : "s"} of up to{" "}
                <span className="font-medium text-zinc-900">{formatMoney(installmentValue)}</span>, from{" "}
                {formatPeriod(startPeriod)} to {formatPeriod(addMonths(startPeriod, deductions - 1))}, recovering{" "}
                <span className="font-medium text-zinc-900">{formatMoney(total)}</span>.
              </span>
              {basicSalary > 0 ? (
                <span>
                  The monthly deduction is {Math.round((installmentValue / basicSalary) * 1000) / 10}% of this
                  employee&apos;s basic salary ({formatMoney(basicSalary)}).
                </span>
              ) : employeeId ? (
                <span className="text-amber-700">
                  This employee has no basic salary set, so nothing can be deducted until their pay is set up in
                  Component assignment.
                </span>
              ) : null}
            </div>
          ) : null}
          {copy.needsApproval && !plan ? (
            <p className="text-xs text-zinc-500 sm:col-span-4">
              The {copy.noun} is saved as pending. Deductions start once it is approved and paid out.
            </p>
          ) : null}
        </div>
      ) : null}
    </FormDialogFrame>
  );
}
