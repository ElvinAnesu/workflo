import assert from "node:assert/strict";
import test from "node:test";
import { can, featureForPath, firstAllowedHref } from "../../lib/access.ts";

const none = { isSuperUser: false, permissions: {} };

test("super user can open every action", () => {
  assert.equal(can({ isSuperUser: true, permissions: {} }, "employees", "delete"), true);
});

test("a role without view cannot open that screen", () => {
  assert.equal(can(none, "employees", "view"), false);
  assert.equal(
    can(
      {
        isSuperUser: false,
        permissions: { employees: { view: true, create: false, edit: false, delete: false } },
      },
      "employees",
      "create",
    ),
    false,
  );
});

test("nested payroll routes use the parent feature", () => {
  assert.equal(featureForPath("/payroll/monthly/12"), "monthlyPayrollProcessing");
  assert.equal(featureForPath("/payroll/monthly/12/payslips"), "monthlyPayrollProcessing");
  assert.equal(featureForPath("/leave-types"), "leaveTypes");
  assert.equal(featureForPath("/leave/requests"), "leaveRequests");
});

test("the first allowed menu page is the landing page", () => {
  assert.equal(
    firstAllowedHref({
      isSuperUser: false,
      permissions: { shifts: { view: true, create: false, edit: false, delete: false } },
    }),
    "/shifts",
  );
  assert.equal(firstAllowedHref(none), null);
});
