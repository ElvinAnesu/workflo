import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  countWorkingDays,
  daysTaken,
  entitlement,
  validateLeaveRequest,
} from "./leave-calc.ts";
import type { LeaveRequestRow } from "./leave-request.types.ts";
import type { LeaveTypeRow } from "../leave-types/leave-type.types.ts";
import type { LeaveBalanceRow } from "../leave-balances/leave-balance.types.ts";
import { scheduledEmployeeIds, weekdayOf } from "../timetable/schedule.ts";

const annual: LeaveTypeRow = {
  id: "annual",
  leaveTypeName: "Annual",
  daysPerYear: 20,
  paidUnpaid: "Paid",
  appliesTo: "Everyone",
};
const special: LeaveTypeRow = { ...annual, id: "special", appliesTo: "Assign as needed" };

function request(overrides: Partial<LeaveRequestRow>): LeaveRequestRow {
  return {
    id: "R1",
    employeeId: "E1",
    leaveTypeId: "annual",
    startDate: "2026-10-05",
    endDate: "2026-10-09",
    days: 5,
    note: "",
    status: "Approved",
    decidedBy: "",
    decidedOn: "",
    ...overrides,
  };
}

describe("countWorkingDays", () => {
  test("counts Monday to Friday inclusive and skips weekends", () => {
    // 2026-10-05 is a Monday.
    assert.equal(countWorkingDays("2026-10-05", "2026-10-09"), 5);
    assert.equal(countWorkingDays("2026-10-05", "2026-10-11"), 5);
    assert.equal(countWorkingDays("2026-10-05", "2026-10-12"), 6);
    assert.equal(countWorkingDays("2026-10-10", "2026-10-11"), 0);
  });

  test("returns zero for reversed or missing dates", () => {
    assert.equal(countWorkingDays("2026-10-09", "2026-10-05"), 0);
    assert.equal(countWorkingDays("", "2026-10-05"), 0);
  });
});

describe("daysTaken and entitlement", () => {
  const requests = [
    request({ id: "a" }),
    request({ id: "b", status: "Pending", startDate: "2026-10-12", endDate: "2026-10-12" }),
    request({ id: "c", startDate: "2026-12-30", endDate: "2027-01-04" }),
  ];

  test("counts only approved leave, split across years", () => {
    // 30, 31 Dec 2026 are Wed/Thu; 1 Jan 2027 Fri; 4 Jan 2027 Mon.
    assert.equal(daysTaken(requests, "E1", "annual", 2026), 5 + 2);
    assert.equal(daysTaken(requests, "E1", "annual", 2027), 2);
  });

  test("uses a balance record first, then the type default for 'Everyone'", () => {
    const balances: LeaveBalanceRow[] = [
      { id: "B", employeeId: "E1", leaveTypeId: "annual", year: 2026, entitled: 28 },
    ];
    assert.equal(entitlement(balances, [annual, special], "E1", "annual", 2026), 28);
    assert.equal(entitlement(balances, [annual, special], "E1", "annual", 2027), 20);
    assert.equal(entitlement(balances, [annual, special], "E1", "special", 2026), null);
    assert.equal(entitlement(balances, [annual, special], "E1", "special", 2026, true), 20);
    assert.equal(entitlement(balances, [annual, special], "E1", "annual", 2026, false, false), null);
  });
});

describe("validateLeaveRequest", () => {
  const context = {
    requests: [request({ id: "a", startDate: "2026-10-05", endDate: "2026-10-16" })],
    balances: [],
    leaveTypes: [annual, special],
  };

  test("accepts a request within the remaining balance", () => {
    assert.deepEqual(
      validateLeaveRequest(
        { employeeId: "E1", leaveTypeId: "annual", startDate: "2026-11-02", endDate: "2026-11-06" },
        context,
      ),
      [],
    );
  });

  test("rejects overlaps, weekend-only, over-balance and missing balances", () => {
    assert.match(
      validateLeaveRequest(
        { employeeId: "E1", leaveTypeId: "annual", startDate: "2026-10-14", endDate: "2026-10-20" },
        context,
      )[0],
      /Overlaps/,
    );
    assert.match(
      validateLeaveRequest(
        { employeeId: "E1", leaveTypeId: "annual", startDate: "2026-10-17", endDate: "2026-10-18" },
        context,
      )[0],
      /weekend/,
    );
    // 10 used of 20; 11 more is too many.
    assert.match(
      validateLeaveRequest(
        { employeeId: "E1", leaveTypeId: "annual", startDate: "2026-11-02", endDate: "2026-11-16" },
        context,
      )[0],
      /Only 10 days left for 2026; this request needs 11/,
    );
    assert.match(
      validateLeaveRequest(
        { employeeId: "E1", leaveTypeId: "special", startDate: "2026-11-02", endDate: "2026-11-02" },
        context,
      )[0],
      /No 2026 leave balance/,
    );
  });

  test("an edited request does not clash with or count against itself", () => {
    assert.deepEqual(
      validateLeaveRequest(
        { id: "a", employeeId: "E1", leaveTypeId: "annual", startDate: "2026-10-05", endDate: "2026-10-16" },
        context,
      ),
      [],
    );
  });
});

describe("scheduledEmployeeIds", () => {
  const timetable = [
    { id: "1", shiftId: "S", pattern: "weekly" as const, weekdays: ["Monday"], date: "", employeeIds: ["E1", "E2"] },
    { id: "2", shiftId: "S", pattern: "date" as const, weekdays: [], date: "2026-10-06", employeeIds: ["E3"] },
    { id: "3", shiftId: "OTHER", pattern: "weekly" as const, weekdays: ["Monday"], date: "", employeeIds: ["E9"] },
  ];

  test("combines weekly entries and date overrides for the shift", () => {
    assert.equal(weekdayOf("2026-10-05"), "Monday");
    assert.deepEqual(scheduledEmployeeIds(timetable, "S", "2026-10-05"), ["E1", "E2"]);
    assert.deepEqual(scheduledEmployeeIds(timetable, "S", "2026-10-06"), ["E3"]);
    assert.deepEqual(scheduledEmployeeIds(timetable, "S", "2026-10-07"), []);
  });
});
