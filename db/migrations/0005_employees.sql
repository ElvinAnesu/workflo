-- 0005: company-scoped employees.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0005_employees.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.
-- Requires dbo.branches and dbo.departments from 0003.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0005')
BEGIN
    PRINT N'0005_employees already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

ALTER TABLE dbo.branches
    ADD CONSTRAINT uq_branches_id_company UNIQUE (id, company_id);

ALTER TABLE dbo.departments
    ADD CONSTRAINT uq_departments_id_company UNIQUE (id, company_id);

ALTER TABLE dbo.employment_types
    ADD CONSTRAINT uq_employment_types_id_company UNIQUE (id, company_id);

ALTER TABLE dbo.employee_categories
    ADD CONSTRAINT uq_employee_categories_id_company UNIQUE (id, company_id);
GO

CREATE TABLE dbo.employees (
    id                       INT IDENTITY(1,1) NOT NULL,
    company_id               INT               NOT NULL,
    employee_code            NVARCHAR(20)      NOT NULL,
    first_name               NVARCHAR(100)     NOT NULL,
    middle_name              NVARCHAR(100)     NULL,
    last_name                NVARCHAR(100)     NOT NULL,
    email                    NVARCHAR(256)     NULL,
    phone_number             NVARCHAR(50)      NULL,
    date_of_birth            DATE              NULL,
    gender                   NVARCHAR(50)      NULL,
    id_number                NVARCHAR(50)      NULL,
    passport_number          NVARCHAR(50)      NULL,
    marital_status           NVARCHAR(50)      NULL,
    emergency_contact_name   NVARCHAR(200)     NULL,
    emergency_contact_phone  NVARCHAR(50)      NULL,
    employment_type_id       INT               NULL,
    employee_category_id     INT               NULL,
    designation              NVARCHAR(200)     NULL,
    department_id            INT               NULL,
    branch_id                INT               NULL,
    join_date                DATE              NULL,
    nssf_number              NVARCHAR(50)      NULL,
    office_email             NVARCHAR(256)     NULL,
    office_phone             NVARCHAR(50)      NULL,
    status                   NVARCHAR(20)      NOT NULL CONSTRAINT df_employees_status DEFAULT N'Active',
    created_at               DATETIME2(0)      NOT NULL CONSTRAINT df_employees_created_at DEFAULT SYSUTCDATETIME(),
    updated_at               DATETIME2(0)      NOT NULL CONSTRAINT df_employees_updated_at DEFAULT SYSUTCDATETIME(),
    created_by               INT               NULL,
    updated_by               INT               NULL,
    CONSTRAINT pk_employees PRIMARY KEY (id),
    CONSTRAINT uq_employees_company_code UNIQUE (company_id, employee_code),
    CONSTRAINT ck_employees_code_not_blank CHECK (LEN(employee_code) > 0),
    CONSTRAINT ck_employees_first_name_not_blank CHECK (LEN(first_name) > 0),
    CONSTRAINT ck_employees_last_name_not_blank CHECK (LEN(last_name) > 0),
    CONSTRAINT ck_employees_status CHECK (status IN (N'Active', N'Inactive', N'Terminated')),
    CONSTRAINT fk_employees_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_employees_branch FOREIGN KEY (branch_id, company_id) REFERENCES dbo.branches (id, company_id),
    CONSTRAINT fk_employees_department FOREIGN KEY (department_id, company_id) REFERENCES dbo.departments (id, company_id),
    CONSTRAINT fk_employees_employment_type FOREIGN KEY (employment_type_id, company_id) REFERENCES dbo.employment_types (id, company_id),
    CONSTRAINT fk_employees_employee_category FOREIGN KEY (employee_category_id, company_id) REFERENCES dbo.employee_categories (id, company_id),
    CONSTRAINT fk_employees_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_employees_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_employees_company_id ON dbo.employees (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0005');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
