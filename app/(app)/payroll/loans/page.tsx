import { DeductionPlansRoute } from "@/app/(app)/payroll/plans-route";

export default function LoansRoute({ searchParams }: PageProps<"/payroll/loans">) {
  return <DeductionPlansRoute kind="Loan" searchParams={searchParams} />;
}
