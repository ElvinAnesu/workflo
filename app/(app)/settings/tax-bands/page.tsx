import { TaxBandsPage } from "@/components/payroll/settings/tax-bands-page";
import { listTaxBands } from "@/server/payroll";

export default async function TaxBandsRoute() {
  const taxBands = await listTaxBands();
  return <TaxBandsPage taxBands={taxBands} />;
}
