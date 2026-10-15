import type { LeaveBalanceRow } from "../leave-balances/leave-balance.types.ts";
import type { LeaveRequestRow } from "./leave-request.types.ts";
import type { LeaveTypeRow } from "../leave-types/leave-type.types.ts";

// Leave is counted in working days: Monday to Friday. Public holidays are not
// configured anywhere yet, so they are not excluded.

function toUtc(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function countWorkingDays(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) {
    return 0;
  }
  let count = 0;
  for (let time = toUtc(startDate); time <= toUtc(endDate); time += DAY_MS) {
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      count += 1;
    }
  }
  return count;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

// Approved working days taken in a calendar year; requests spanning New Year
// are split between the two years.
export function daysTaken(
  requests: LeaveRequestRow[],
  employeeId: string,
  leaveTypeId: string,
  year: number,
  excludeRequestId?: string,
) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return requests
    .filter(
      (request) =>
        request.id !== excludeRequestId &&
        request.status === "Approved" &&
        request.employeeId === employeeId &&
        request.leaveTypeId === leaveTypeId &&
        rangesOverlap(request.startDate, request.endDate, yearStart, yearEnd),
    )
    .reduce(
      (total, request) =>
        total +
        countWorkingDays(
          request.startDate < yearStart ? yearStart : request.startDate,
          request.endDate > yearEnd ? yearEnd : request.endDate,
        ),
      0,
    );
}

// Entitlement for the year: an override balance, otherwise the type's days per
// year when the person is covered. Everyone is covered. Assign as needed is
// covered only when `assigned` is true. `covered` false blocks the year.
export function entitlement(
  balances: LeaveBalanceRow[],
  leaveTypes: LeaveTypeRow[],
  employeeId: string,
  leaveTypeId: string,
  year: number,
  assigned = false,
  covered = true,
): number | null {
  if (!covered) {
    return null;
  }
  const balance = balances.find(
    (item) =>
      item.employeeId === employeeId && item.leaveTypeId === leaveTypeId && item.year === year,
  );
  if (balance) {
    return balance.entitled;
  }
  const type = leaveTypes.find((item) => item.id === leaveTypeId);
  if (!type) {
    return null;
  }
  if (type.appliesTo === "Everyone" || assigned) {
    return type.daysPerYear;
  }
  return null;
}

export type LeaveRequestCheck = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  id?: string;
};

// Problems that should stop a request being submitted or approved.
export function validateLeaveRequest(
  request: LeaveRequestCheck,
  context: {
    requests: LeaveRequestRow[];
    balances: LeaveBalanceRow[];
    leaveTypes: LeaveTypeRow[];
    assigned?: boolean;
    coveredYear?: (year: number) => boolean;
  },
) {
  const errors: string[] = [];
  const days = countWorkingDays(request.startDate, request.endDate);

  if (request.endDate < request.startDate) {
    errors.push("The end date cannot be before the start date.");
    return errors;
  }
  if (days === 0) {
    errors.push("The selected dates fall on a weekend only.");
    return errors;
  }

  const clash = context.requests.find(
    (item) =>
      item.id !== request.id &&
      item.employeeId === request.employeeId &&
      item.status !== "Rejected" &&
      rangesOverlap(item.startDate, item.endDate, request.startDate, request.endDate),
  );
  if (clash) {
    errors.push(
      `Overlaps another ${clash.status.toLowerCase()} request (${clash.startDate} to ${clash.endDate}).`,
    );
  }

  // Check each calendar year the request touches against that year's balance.
  const firstYear = Number(request.startDate.slice(0, 4));
  const lastYear = Number(request.endDate.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year += 1) {
    const allowed = entitlement(
      context.balances,
      context.leaveTypes,
      request.employeeId,
      request.leaveTypeId,
      year,
      context.assigned ?? false,
      context.coveredYear ? context.coveredYear(year) : true,
    );
    if (allowed === null) {
      errors.push(`No ${year} leave balance is set for this employee and leave type.`);
      continue;
    }
    const requested = countWorkingDays(
      request.startDate < `${year}-01-01` ? `${year}-01-01` : request.startDate,
      request.endDate > `${year}-12-31` ? `${year}-12-31` : request.endDate,
    );
    const remaining =
      allowed - daysTaken(context.requests, request.employeeId, request.leaveTypeId, year, request.id);
    if (requested > remaining) {
      errors.push(
        `Only ${remaining} day${remaining === 1 ? "" : "s"} left for ${year}; this request needs ${requested}.`,
      );
    }
  }

  return errors;
}
