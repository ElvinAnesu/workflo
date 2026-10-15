import { PayslipViewerPage } from "@/components/payroll/payslip-viewer-page";
import { firstParam, readListParams } from "@/components/payroll/list-query";
import { listPayslips } from "@/server/payroll-operations";

export default async function PayslipsRoute({ searchParams }: PageProps<"/payroll/payslips">) {
  const params = await searchParams;
  const list = readListParams(params);
  const employeeId = firstParam(params.employee) ?? "";
  const month = firstParam(params.month) ?? "";
  const year = firstParam(params.year) ?? "";
  const result = await listPayslips({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
    employeeId,
    month,
    year,
  });

  return (
    <PayslipViewerPage
      rows={result.rows}
      totalCount={result.totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
      employeeId={employeeId}
      month={month}
      year={year}
      employees={result.employees}
      years={result.years}
      hasAny={result.employees.length > 0}
    />
  );
}
