import {
  CurrentCompanyEmpty,
  CurrentCompanyForm,
} from "@/components/company/current-company-form";
import { getCompany } from "@/server/companies";
import { getSession } from "@/server/session";

export default async function CompanyPage() {
  const session = await getSession();
  const company = session?.company
    ? await getCompany(session.company.id)
    : null;

  if (!company) {
    return <CurrentCompanyEmpty />;
  }

  return <CurrentCompanyForm company={company} />;
}
