-- 0013: company-scoped payroll settings, pay profiles, holds, plans and runs.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0013_payroll.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.
-- Requires dbo.employees from 0005.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0013')
BEGIN
    PRINT N'0013_payroll already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.banks (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    name        NVARCHAR(200)     NOT NULL,
    code        NVARCHAR(50)      NOT NULL,
    CONSTRAINT pk_banks PRIMARY KEY (id),
    CONSTRAINT uq_banks_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_banks_company_name UNIQUE (company_id, name),
    CONSTRAINT uq_banks_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_banks_name CHECK (LEN(name) > 0),
    CONSTRAINT ck_banks_code CHECK (LEN(code) > 0),
    CONSTRAINT fk_banks_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_banks_company_id ON dbo.banks (company_id);
GO

CREATE TABLE dbo.pay_components (
    id             INT IDENTITY(1,1) NOT NULL,
    company_id     INT               NOT NULL,
    code           NVARCHAR(50)      NOT NULL,
    name           NVARCHAR(200)     NOT NULL,
    type           NVARCHAR(20)      NOT NULL,
    calculation    NVARCHAR(30)      NOT NULL,
    default_value  DECIMAL(18,2)     NOT NULL,
    taxable        BIT               NOT NULL,
    active         BIT               NOT NULL,
    CONSTRAINT pk_pay_components PRIMARY KEY (id),
    CONSTRAINT uq_pay_components_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_pay_components_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_pay_components_code CHECK (LEN(code) > 0),
    CONSTRAINT ck_pay_components_name CHECK (LEN(name) > 0),
    CONSTRAINT ck_pay_components_type CHECK (type IN (N'Earning', N'Deduction')),
    CONSTRAINT ck_pay_components_calculation CHECK (calculation IN (N'Fixed amount', N'% of basic salary')),
    CONSTRAINT fk_pay_components_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_pay_components_company_id ON dbo.pay_components (company_id);
GO

CREATE TABLE dbo.statutory_contributions (
    id                  INT IDENTITY(1,1) NOT NULL,
    company_id          INT               NOT NULL,
    code                NVARCHAR(50)      NOT NULL,
    name                NVARCHAR(200)     NOT NULL,
    base                NVARCHAR(20)      NOT NULL,
    employee_rate       DECIMAL(8,4)      NOT NULL,
    employer_rate       DECIMAL(8,4)      NOT NULL,
    deduct_before_tax   BIT               NOT NULL,
    scope               NVARCHAR(30)      NOT NULL,
    active              BIT               NOT NULL,
    CONSTRAINT pk_statutory_contributions PRIMARY KEY (id),
    CONSTRAINT uq_statutory_contributions_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_statutory_contributions_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_statutory_contributions_code CHECK (LEN(code) > 0),
    CONSTRAINT ck_statutory_contributions_name CHECK (LEN(name) > 0),
    CONSTRAINT ck_statutory_contributions_base CHECK (base IN (N'Gross pay', N'Basic salary')),
    CONSTRAINT ck_statutory_contributions_scope CHECK (scope IN (N'All employees', N'Selected employees')),
    CONSTRAINT fk_statutory_contributions_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_statutory_contributions_company_id ON dbo.statutory_contributions (company_id);
GO

CREATE TABLE dbo.tax_bands (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    band_from   DECIMAL(18,2)     NOT NULL,
    band_to     DECIMAL(18,2)     NULL,
    rate        DECIMAL(8,4)      NOT NULL,
    sort_order  INT               NOT NULL,
    CONSTRAINT pk_tax_bands PRIMARY KEY (id),
    CONSTRAINT fk_tax_bands_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_tax_bands_company_id ON dbo.tax_bands (company_id);
GO

CREATE TABLE dbo.overtime_types (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    code        NVARCHAR(50)      NOT NULL,
    name        NVARCHAR(200)     NOT NULL,
    multiplier  DECIMAL(8,4)      NOT NULL,
    taxable     BIT               NOT NULL,
    active      BIT               NOT NULL,
    CONSTRAINT pk_overtime_types PRIMARY KEY (id),
    CONSTRAINT uq_overtime_types_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_overtime_types_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_overtime_types_code CHECK (LEN(code) > 0),
    CONSTRAINT ck_overtime_types_name CHECK (LEN(name) > 0),
    CONSTRAINT fk_overtime_types_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_overtime_types_company_id ON dbo.overtime_types (company_id);

CREATE TABLE dbo.overtime_settings (
    company_id               INT           NOT NULL,
    standard_monthly_hours   DECIMAL(8,2)  NOT NULL CONSTRAINT df_overtime_settings_hours DEFAULT (0),
    CONSTRAINT pk_overtime_settings PRIMARY KEY (company_id),
    CONSTRAINT fk_overtime_settings_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);
GO

CREATE TABLE dbo.employee_pay_profiles (
    id              INT IDENTITY(1,1) NOT NULL,
    company_id      INT               NOT NULL,
    employee_id     INT               NOT NULL,
    basic_salary    DECIMAL(18,2)     NOT NULL CONSTRAINT df_employee_pay_profiles_basic DEFAULT (0),
    bank_id         INT               NULL,
    account_number  NVARCHAR(50)      NOT NULL CONSTRAINT df_employee_pay_profiles_account DEFAULT (N''),
    CONSTRAINT pk_employee_pay_profiles PRIMARY KEY (id),
    CONSTRAINT uq_employee_pay_profiles_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_employee_pay_profiles_employee UNIQUE (company_id, employee_id),
    CONSTRAINT fk_employee_pay_profiles_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_employee_pay_profiles_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id),
    CONSTRAINT fk_employee_pay_profiles_bank FOREIGN KEY (bank_id, company_id) REFERENCES dbo.banks (id, company_id)
);

CREATE INDEX ix_employee_pay_profiles_company_id ON dbo.employee_pay_profiles (company_id);

CREATE TABLE dbo.employee_pay_components (
    company_id        INT            NOT NULL,
    employee_id       INT            NOT NULL,
    pay_component_id  INT            NOT NULL,
    value             DECIMAL(18,2)  NOT NULL,
    CONSTRAINT pk_employee_pay_components PRIMARY KEY (company_id, employee_id, pay_component_id),
    CONSTRAINT fk_employee_pay_components_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id),
    CONSTRAINT fk_employee_pay_components_component FOREIGN KEY (pay_component_id, company_id) REFERENCES dbo.pay_components (id, company_id) ON DELETE CASCADE
);

CREATE TABLE dbo.employee_pay_contributions (
    company_id                 INT NOT NULL,
    employee_id                INT NOT NULL,
    statutory_contribution_id  INT NOT NULL,
    CONSTRAINT pk_employee_pay_contributions PRIMARY KEY (company_id, employee_id, statutory_contribution_id),
    CONSTRAINT fk_employee_pay_contributions_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id),
    CONSTRAINT fk_employee_pay_contributions_contribution FOREIGN KEY (statutory_contribution_id, company_id) REFERENCES dbo.statutory_contributions (id, company_id) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.salary_holds (
    id           INT IDENTITY(1,1) NOT NULL,
    company_id   INT               NOT NULL,
    employee_id  INT               NOT NULL,
    from_period  CHAR(7)           NOT NULL,
    to_period    CHAR(7)           NULL,
    reason       NVARCHAR(500)     NOT NULL,
    created_on   DATE              NOT NULL,
    released_on  DATE              NULL,
    CONSTRAINT pk_salary_holds PRIMARY KEY (id),
    CONSTRAINT uq_salary_holds_id_company UNIQUE (id, company_id),
    CONSTRAINT ck_salary_holds_reason CHECK (LEN(reason) > 0),
    CONSTRAINT fk_salary_holds_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_salary_holds_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);

CREATE INDEX ix_salary_holds_company_id ON dbo.salary_holds (company_id);
GO

CREATE TABLE dbo.deduction_plans (
    id             INT IDENTITY(1,1) NOT NULL,
    company_id     INT               NOT NULL,
    kind           NVARCHAR(20)      NOT NULL,
    employee_id    INT               NOT NULL,
    category       NVARCHAR(200)     NOT NULL CONSTRAINT df_deduction_plans_category DEFAULT (N''),
    reason         NVARCHAR(1000)    NOT NULL CONSTRAINT df_deduction_plans_reason DEFAULT (N''),
    principal      DECIMAL(18,2)     NOT NULL,
    interest_rate  DECIMAL(8,4)      NOT NULL CONSTRAINT df_deduction_plans_interest DEFAULT (0),
    total          DECIMAL(18,2)     NOT NULL,
    installment    DECIMAL(18,2)     NOT NULL,
    start_period   CHAR(7)           NOT NULL,
    status         NVARCHAR(20)      NOT NULL,
    requested_on   DATE              NOT NULL,
    approved_by    NVARCHAR(200)     NOT NULL CONSTRAINT df_deduction_plans_approved_by DEFAULT (N''),
    approved_on    DATE              NULL,
    disbursed_on   DATE              NULL,
    closed_on      DATE              NULL,
    close_reason   NVARCHAR(1000)    NOT NULL CONSTRAINT df_deduction_plans_close_reason DEFAULT (N''),
    CONSTRAINT pk_deduction_plans PRIMARY KEY (id),
    CONSTRAINT uq_deduction_plans_id_company UNIQUE (id, company_id),
    CONSTRAINT ck_deduction_plans_kind CHECK (kind IN (N'Loan', N'Advance', N'Recovery')),
    CONSTRAINT ck_deduction_plans_status CHECK (status IN (N'Pending', N'Rejected', N'Active', N'Paused', N'Closed')),
    CONSTRAINT ck_deduction_plans_principal CHECK (principal > 0),
    CONSTRAINT ck_deduction_plans_installment CHECK (installment > 0),
    CONSTRAINT fk_deduction_plans_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_deduction_plans_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);

CREATE INDEX ix_deduction_plans_company_id ON dbo.deduction_plans (company_id);

CREATE TABLE dbo.deduction_repayments (
    id                  INT IDENTITY(1,1) NOT NULL,
    company_id          INT               NOT NULL,
    deduction_plan_id   INT               NOT NULL,
    repaid_on           DATE              NOT NULL,
    amount              DECIMAL(18,2)     NOT NULL,
    note                NVARCHAR(500)     NOT NULL CONSTRAINT df_deduction_repayments_note DEFAULT (N''),
    CONSTRAINT pk_deduction_repayments PRIMARY KEY (id),
    CONSTRAINT ck_deduction_repayments_amount CHECK (amount > 0),
    CONSTRAINT fk_deduction_repayments_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_deduction_repayments_plan FOREIGN KEY (deduction_plan_id, company_id) REFERENCES dbo.deduction_plans (id, company_id) ON DELETE CASCADE
);

CREATE INDEX ix_deduction_repayments_company_id ON dbo.deduction_repayments (company_id);
GO

CREATE TABLE dbo.payroll_runs (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    period        CHAR(7)           NOT NULL,
    status        NVARCHAR(20)      NOT NULL,
    created_on    DATE              NOT NULL,
    calculated_on DATETIME2(0)      NULL,
    approved_by   NVARCHAR(200)     NOT NULL CONSTRAINT df_payroll_runs_approved_by DEFAULT (N''),
    approved_on   DATE              NULL,
    locked_on     DATE              NULL,
    CONSTRAINT pk_payroll_runs PRIMARY KEY (id),
    CONSTRAINT uq_payroll_runs_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_payroll_runs_company_period UNIQUE (company_id, period),
    CONSTRAINT ck_payroll_runs_status CHECK (status IN (N'Draft', N'Approved', N'Locked')),
    CONSTRAINT fk_payroll_runs_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_payroll_runs_company_id ON dbo.payroll_runs (company_id);

CREATE TABLE dbo.payroll_run_columns (
    company_id       INT           NOT NULL,
    payroll_run_id   INT           NOT NULL,
    contribution_id  NVARCHAR(50)  NOT NULL,
    code             NVARCHAR(50)  NOT NULL,
    name             NVARCHAR(200) NOT NULL,
    sort_order       INT           NOT NULL,
    CONSTRAINT pk_payroll_run_columns PRIMARY KEY (payroll_run_id, contribution_id),
    CONSTRAINT fk_payroll_run_columns_run FOREIGN KEY (payroll_run_id, company_id) REFERENCES dbo.payroll_runs (id, company_id)
);

CREATE TABLE dbo.payroll_run_lines (
    id                      INT IDENTITY(1,1) NOT NULL,
    company_id              INT               NOT NULL,
    payroll_run_id          INT               NOT NULL,
    employee_id             INT               NOT NULL,
    employee_name           NVARCHAR(300)     NOT NULL,
    department              NVARCHAR(200)     NOT NULL CONSTRAINT df_payroll_run_lines_department DEFAULT (N''),
    designation             NVARCHAR(200)     NOT NULL CONSTRAINT df_payroll_run_lines_designation DEFAULT (N''),
    basic_salary            DECIMAL(18,2)     NOT NULL,
    gross_pay               DECIMAL(18,2)     NOT NULL,
    taxable_earnings        DECIMAL(18,2)     NOT NULL,
    pre_tax_deductions      DECIMAL(18,2)     NOT NULL,
    taxable_income          DECIMAL(18,2)     NOT NULL,
    paye                    DECIMAL(18,2)     NOT NULL,
    employee_contributions  DECIMAL(18,2)     NOT NULL,
    other_deductions        DECIMAL(18,2)     NOT NULL,
    total_deductions        DECIMAL(18,2)     NOT NULL,
    net_pay                 DECIMAL(18,2)     NOT NULL,
    employer_contributions  DECIMAL(18,2)     NOT NULL,
    employer_cost           DECIMAL(18,2)     NOT NULL,
    bank_name               NVARCHAR(200)     NOT NULL CONSTRAINT df_payroll_run_lines_bank DEFAULT (N''),
    account_number          NVARCHAR(50)      NOT NULL CONSTRAINT df_payroll_run_lines_account DEFAULT (N''),
    held                    BIT               NOT NULL,
    hold_reason             NVARCHAR(500)     NOT NULL CONSTRAINT df_payroll_run_lines_hold_reason DEFAULT (N''),
    warnings                NVARCHAR(1000)    NOT NULL CONSTRAINT df_payroll_run_lines_warnings DEFAULT (N''),
    CONSTRAINT pk_payroll_run_lines PRIMARY KEY (id),
    CONSTRAINT uq_payroll_run_lines_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_payroll_run_lines_run_employee UNIQUE (payroll_run_id, employee_id),
    CONSTRAINT fk_payroll_run_lines_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_payroll_run_lines_run FOREIGN KEY (payroll_run_id, company_id) REFERENCES dbo.payroll_runs (id, company_id),
    CONSTRAINT fk_payroll_run_lines_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);

CREATE TABLE dbo.payroll_run_earnings (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    line_id       INT               NOT NULL,
    component_id  NVARCHAR(80)      NOT NULL,
    code          NVARCHAR(50)      NOT NULL,
    name          NVARCHAR(300)     NOT NULL,
    amount        DECIMAL(18,2)     NOT NULL,
    taxable       BIT               NOT NULL,
    sort_order    INT               NOT NULL,
    CONSTRAINT pk_payroll_run_earnings PRIMARY KEY (id),
    CONSTRAINT fk_payroll_run_earnings_line FOREIGN KEY (line_id, company_id) REFERENCES dbo.payroll_run_lines (id, company_id)
);

CREATE TABLE dbo.payroll_run_deductions (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    line_id       INT               NOT NULL,
    component_id  NVARCHAR(80)      NOT NULL,
    code          NVARCHAR(50)      NOT NULL,
    name          NVARCHAR(300)     NOT NULL,
    amount        DECIMAL(18,2)     NOT NULL,
    taxable       BIT               NOT NULL,
    sort_order    INT               NOT NULL,
    CONSTRAINT pk_payroll_run_deductions PRIMARY KEY (id),
    CONSTRAINT fk_payroll_run_deductions_line FOREIGN KEY (line_id, company_id) REFERENCES dbo.payroll_run_lines (id, company_id)
);

CREATE TABLE dbo.payroll_run_contribution_lines (
    id               INT IDENTITY(1,1) NOT NULL,
    company_id       INT               NOT NULL,
    line_id          INT               NOT NULL,
    contribution_id  NVARCHAR(50)      NOT NULL,
    code             NVARCHAR(50)      NOT NULL,
    name             NVARCHAR(200)     NOT NULL,
    base_amount      DECIMAL(18,2)     NOT NULL,
    employee_amount  DECIMAL(18,2)     NOT NULL,
    employer_amount  DECIMAL(18,2)     NOT NULL,
    deduct_before_tax BIT              NOT NULL,
    sort_order       INT               NOT NULL,
    CONSTRAINT pk_payroll_run_contribution_lines PRIMARY KEY (id),
    CONSTRAINT fk_payroll_run_contribution_lines_line FOREIGN KEY (line_id, company_id) REFERENCES dbo.payroll_run_lines (id, company_id)
);

CREATE TABLE dbo.payroll_run_excluded (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    payroll_run_id INT              NOT NULL,
    employee_id   INT               NOT NULL,
    employee_name NVARCHAR(300)     NOT NULL,
    reason        NVARCHAR(300)     NOT NULL,
    CONSTRAINT pk_payroll_run_excluded PRIMARY KEY (id),
    CONSTRAINT fk_payroll_run_excluded_run FOREIGN KEY (payroll_run_id, company_id) REFERENCES dbo.payroll_runs (id, company_id),
    CONSTRAINT fk_payroll_run_excluded_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);
GO

CREATE TABLE dbo.mid_month_runs (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    period        CHAR(7)           NOT NULL,
    status        NVARCHAR(20)      NOT NULL,
    basis         NVARCHAR(30)      NOT NULL,
    value         DECIMAL(18,2)     NOT NULL,
    payment_date  DATE              NOT NULL,
    created_on    DATE              NOT NULL,
    calculated_on DATETIME2(0)      NULL,
    approved_by   NVARCHAR(200)     NOT NULL CONSTRAINT df_mid_month_runs_approved_by DEFAULT (N''),
    approved_on   DATE              NULL,
    locked_on     DATE              NULL,
    CONSTRAINT pk_mid_month_runs PRIMARY KEY (id),
    CONSTRAINT uq_mid_month_runs_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_mid_month_runs_company_period UNIQUE (company_id, period),
    CONSTRAINT ck_mid_month_runs_status CHECK (status IN (N'Draft', N'Approved', N'Locked')),
    CONSTRAINT ck_mid_month_runs_basis CHECK (basis IN (N'% of basic salary', N'Fixed amount')),
    CONSTRAINT fk_mid_month_runs_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_mid_month_runs_company_id ON dbo.mid_month_runs (company_id);

CREATE TABLE dbo.mid_month_lines (
    id              INT IDENTITY(1,1) NOT NULL,
    company_id      INT               NOT NULL,
    mid_month_run_id INT              NOT NULL,
    employee_id     INT               NOT NULL,
    employee_name   NVARCHAR(300)     NOT NULL,
    department      NVARCHAR(200)     NOT NULL CONSTRAINT df_mid_month_lines_department DEFAULT (N''),
    designation     NVARCHAR(200)     NOT NULL CONSTRAINT df_mid_month_lines_designation DEFAULT (N''),
    basic_salary    DECIMAL(18,2)     NOT NULL,
    estimated_net   DECIMAL(18,2)     NOT NULL,
    default_amount  DECIMAL(18,2)     NOT NULL,
    amount          DECIMAL(18,2)     NOT NULL,
    overridden      BIT               NOT NULL,
    bank_name       NVARCHAR(200)     NOT NULL CONSTRAINT df_mid_month_lines_bank DEFAULT (N''),
    account_number  NVARCHAR(50)      NOT NULL CONSTRAINT df_mid_month_lines_account DEFAULT (N''),
    warnings        NVARCHAR(1000)    NOT NULL CONSTRAINT df_mid_month_lines_warnings DEFAULT (N''),
    CONSTRAINT pk_mid_month_lines PRIMARY KEY (id),
    CONSTRAINT uq_mid_month_lines_run_employee UNIQUE (mid_month_run_id, employee_id),
    CONSTRAINT fk_mid_month_lines_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_mid_month_lines_run FOREIGN KEY (mid_month_run_id, company_id) REFERENCES dbo.mid_month_runs (id, company_id),
    CONSTRAINT fk_mid_month_lines_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);

CREATE TABLE dbo.mid_month_excluded (
    id               INT IDENTITY(1,1) NOT NULL,
    company_id       INT               NOT NULL,
    mid_month_run_id INT               NOT NULL,
    employee_id      INT               NOT NULL,
    employee_name    NVARCHAR(300)     NOT NULL,
    reason           NVARCHAR(300)     NOT NULL,
    CONSTRAINT pk_mid_month_excluded PRIMARY KEY (id),
    CONSTRAINT fk_mid_month_excluded_run FOREIGN KEY (mid_month_run_id, company_id) REFERENCES dbo.mid_month_runs (id, company_id),
    CONSTRAINT fk_mid_month_excluded_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);
GO

CREATE TABLE dbo.overtime_runs (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    period        CHAR(7)           NOT NULL,
    pay_period    CHAR(7)           NOT NULL,
    status        NVARCHAR(20)      NOT NULL,
    created_on    DATE              NOT NULL,
    calculated_on DATETIME2(0)      NULL,
    approved_by   NVARCHAR(200)     NOT NULL CONSTRAINT df_overtime_runs_approved_by DEFAULT (N''),
    approved_on   DATE              NULL,
    locked_on     DATE              NULL,
    CONSTRAINT pk_overtime_runs PRIMARY KEY (id),
    CONSTRAINT uq_overtime_runs_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_overtime_runs_company_period UNIQUE (company_id, period),
    CONSTRAINT ck_overtime_runs_status CHECK (status IN (N'Draft', N'Approved', N'Locked')),
    CONSTRAINT fk_overtime_runs_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
);

CREATE INDEX ix_overtime_runs_company_id ON dbo.overtime_runs (company_id);

CREATE TABLE dbo.overtime_entries (
    id               INT IDENTITY(1,1) NOT NULL,
    company_id       INT               NOT NULL,
    overtime_run_id  INT               NOT NULL,
    employee_id      INT               NOT NULL,
    overtime_type_id INT               NOT NULL,
    worked_on        DATE              NOT NULL,
    hours            DECIMAL(8,2)      NOT NULL,
    note             NVARCHAR(500)     NOT NULL CONSTRAINT df_overtime_entries_note DEFAULT (N''),
    CONSTRAINT pk_overtime_entries PRIMARY KEY (id),
    CONSTRAINT ck_overtime_entries_hours CHECK (hours > 0),
    CONSTRAINT fk_overtime_entries_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_overtime_entries_run FOREIGN KEY (overtime_run_id, company_id) REFERENCES dbo.overtime_runs (id, company_id),
    CONSTRAINT fk_overtime_entries_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id),
    CONSTRAINT fk_overtime_entries_type FOREIGN KEY (overtime_type_id, company_id) REFERENCES dbo.overtime_types (id, company_id)
);

CREATE TABLE dbo.overtime_lines (
    id               INT IDENTITY(1,1) NOT NULL,
    company_id       INT               NOT NULL,
    overtime_run_id  INT               NOT NULL,
    employee_id      INT               NOT NULL,
    employee_name    NVARCHAR(300)     NOT NULL,
    department       NVARCHAR(200)     NOT NULL CONSTRAINT df_overtime_lines_department DEFAULT (N''),
    basic_salary     DECIMAL(18,2)     NOT NULL,
    hourly_rate      DECIMAL(18,2)     NOT NULL,
    hours            DECIMAL(8,2)      NOT NULL,
    amount           DECIMAL(18,2)     NOT NULL,
    CONSTRAINT pk_overtime_lines PRIMARY KEY (id),
    CONSTRAINT uq_overtime_lines_id_company UNIQUE (id, company_id),
    CONSTRAINT uq_overtime_lines_run_employee UNIQUE (overtime_run_id, employee_id),
    CONSTRAINT fk_overtime_lines_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_overtime_lines_run FOREIGN KEY (overtime_run_id, company_id) REFERENCES dbo.overtime_runs (id, company_id),
    CONSTRAINT fk_overtime_lines_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);

CREATE TABLE dbo.overtime_line_items (
    id                INT IDENTITY(1,1) NOT NULL,
    company_id        INT               NOT NULL,
    overtime_line_id  INT               NOT NULL,
    overtime_type_id  INT               NOT NULL,
    code              NVARCHAR(50)      NOT NULL,
    name              NVARCHAR(200)     NOT NULL,
    multiplier        DECIMAL(8,4)      NOT NULL,
    taxable           BIT               NOT NULL,
    hours             DECIMAL(8,2)      NOT NULL,
    amount            DECIMAL(18,2)     NOT NULL,
    CONSTRAINT pk_overtime_line_items PRIMARY KEY (id),
    CONSTRAINT fk_overtime_line_items_line FOREIGN KEY (overtime_line_id, company_id) REFERENCES dbo.overtime_lines (id, company_id)
);

CREATE TABLE dbo.overtime_excluded (
    id               INT IDENTITY(1,1) NOT NULL,
    company_id       INT               NOT NULL,
    overtime_run_id  INT               NOT NULL,
    employee_id      INT               NOT NULL,
    employee_name    NVARCHAR(300)     NOT NULL,
    reason           NVARCHAR(300)     NOT NULL,
    CONSTRAINT pk_overtime_excluded PRIMARY KEY (id),
    CONSTRAINT fk_overtime_excluded_run FOREIGN KEY (overtime_run_id, company_id) REFERENCES dbo.overtime_runs (id, company_id),
    CONSTRAINT fk_overtime_excluded_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id)
);
GO

INSERT INTO dbo.schema_migrations (version) VALUES (N'0013');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
