"use client";

import type { EmployeeRecord } from "@/components/employees/employee.types";
import {
  addEmployees,
  nextEmployeeCode,
} from "@/components/employees/employees-store";
import { getHrState, saveLookup } from "@/components/hr/hr-store";
import { addBanks, addProfiles } from "@/components/payroll/payroll-store";

// Demo data: fictional employees with basic salaries and bank details.
// Deliberately contains no statutory rates, tax bands or pay components;
// those are always configured by the company in Settings.

const PEOPLE: [string, string, string, string, string, number][] = [
  ["Daniel", "Kassim", "Mbwana", "Operations", "Operations Manager", 3200000],
  ["Amina", "Rashidi", "Kitwana", "Finance", "Accountant", 675362.5],
  ["Bakari", "Musa", "Hongoli", "ICD Operations", "Yard Supervisor", 1150000],
  ["Consolata", "Felix", "Nanyaro", "Administration", "Traffic Marshall", 520000],
  ["Dotto", "Masanja", "Luhende", "Transport", "Truck Driver", 680000],
  ["Eliya", "Gabriel", "Mkumbo", "CFS Operations", "Tally Clerk", 610000],
  ["Faraji", "Iddi", "Mpemba", "Security", "Security Guard", 420000],
  ["Gloria", "Anthony", "Swai", "Finance", "Finance Officer", 1250000],
  ["Hamadi", "Shabani", "Kipingu", "ICD Operations", "Forklift Operator", 720000],
  ["Irene", "Boniface", "Mrosso", "Human Resources", "HR Officer", 1100000],
  ["Jabiri", "Selemani", "Ngowi", "Transport", "Fleet Coordinator", 747826],
  ["Khadija", "Omar", "Mrisho", "CFS Operations", "CFS Supervisor", 1051163],
  ["Lameck", "Yohana", "Sanga", "Security", "Security Guard", 348872],
  ["Mwajuma", "Athumani", "Kibwana", "Administration", "Office Administrator", 1145942],
  ["Nassoro", "Ally", "Makame", "ICD Operations", "Operations Engineer", 1739047.36],
  ["Onesmo", "Paschal", "Mtui", "Transport", "Mechanic", 436591],
  ["Prisca", "Wilbard", "Tarimo", "Finance", "Finance Manager", 2805000],
  ["Neema", "Paulo", "Massawe", "Human Resources", "HR Manager", 2600000],
  ["Rehema", "Juma", "Kileo", "Finance", "Cashier", 650000],
  ["Saidi", "Omari", "Mfinanga", "CFS Operations", "Tally Clerk", 590000],
  ["Grace", "Emmanuel", "Mollel", "Administration", "Receptionist", 480000],
  ["Hassani", "Ali", "Mwinyi", "ICD Operations", "Reach Stacker Operator", 880000],
  ["Mariamu", "Said", "Lyimo", "Operations", "Customer Service Officer", 760000],
  ["Peter", "John", "Mwakalinga", "Transport", "Truck Driver", 690000],
  ["Fatuma", "Hamisi", "Chande", "CFS Operations", "Documentation Officer", 820000],
  ["Joseph", "Daudi", "Kisanga", "Security", "Security Supervisor", 640000],
  ["Halima", "Mussa", "Nyoni", "Finance", "Credit Controller", 980000],
  ["Emmanuel", "Petro", "Shayo", "Operations", "Planner", 1300000],
  ["Mwanaidi", "Salum", "Kombo", "Human Resources", "Payroll Officer", 1050000],
  ["Godfrey", "Elias", "Minja", "ICD Operations", "General Worker", 270000],
];

const BANKS = [
  { name: "CRDB Bank", code: "CORUTZTZ" },
  { name: "NMB Bank", code: "NMIBTZTZ" },
  { name: "NBC Bank", code: "NLCBTZTX" },
];

export function loadSampleEmployees() {
  // Create the lookups the sample employees refer to, skipping any that exist.
  const existing = getHrState();
  const ensure = (have: string[], names: string[], save: (name: string) => void) => {
    for (const name of new Set(names)) {
      if (!have.some((item) => item.toLowerCase() === name.toLowerCase())) {
        save(name);
      }
    }
  };
  ensure(existing.branches.map((item) => item.branchName), ["Dar es Salaam"], (name) =>
    saveLookup("branches", { branchName: name, location: "Dar es Salaam" }),
  );
  ensure(
    existing.departments.map((item) => item.departmentName),
    PEOPLE.map((person) => person[3]),
    (name) => saveLookup("departments", { departmentName: name, departmentCode: name.slice(0, 3).toUpperCase() }),
  );
  ensure(
    existing.employmentTypes.map((item) => item.employmentTypeName),
    ["Permanent", "Contract"],
    (name) => saveLookup("employmentTypes", { employmentTypeName: name }),
  );

  const banks = addBanks(BANKS);
  const firstCode = Number(nextEmployeeCode().replace(/\D/g, ""));
  const employees: EmployeeRecord[] = [];

  PEOPLE.forEach(([firstName, middleName, lastName, department, designation], index) => {
    employees.push({
      id: `EMP${String(firstCode + index).padStart(3, "0")}`,
      firstName,
      middleName,
      lastName,
      email: `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com",
      phoneNumber: `07${String(12000000 + index * 7919).slice(0, 8)}`,
      dateOfBirth: "",
      gender: "",
      idNumber: "",
      passportNumber: "",
      maritalStatus: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      employmentType: index % 7 === 6 ? "Contract" : "Permanent",
      employeeCategory: "",
      designation,
      department,
      branch: "Dar es Salaam",
      joinDate: `20${String(15 + (index % 10)).padStart(2, "0")}-0${(index % 9) + 1}-01`,
      nssfNumber: `NSSF${String(100200 + index * 37)}`,
      officeEmail: "",
      officePhone: "",
      // One inactive employee shows that only active staff are paid.
      status: index === 20 ? "Inactive" : "Active",
    });
  });

  addEmployees(employees);
  addProfiles(
    employees.map((employee, index) => {
      // Two employees without bank details show the missing-bank warning.
      const bank = index === 6 || index === 25 ? undefined : banks[index % banks.length];
      return {
        employeeId: employee.id,
        basicSalary: PEOPLE[index][5],
        components: [],
        bankId: bank?.id ?? "",
        accountNumber: bank ? `0${String(150000000 + index * 104729).slice(0, 9)}` : "",
        contributionIds: [],
      };
    }),
  );

  return employees.length;
}
