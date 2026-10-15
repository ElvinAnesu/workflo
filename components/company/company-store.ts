"use client";

import { createPersistentStore } from "@/components/store/persistent-store";

export type CompanyDetails = {
  companyName: string;
  country: string;
  address: string;
};

const store = createPersistentStore<CompanyDetails>("workflo.company.v1", {
  companyName: "",
  country: "",
  address: "",
});

export const useCompanyState = store.useStore;

export function saveCompany(details: CompanyDetails) {
  store.setState(() => details);
}
