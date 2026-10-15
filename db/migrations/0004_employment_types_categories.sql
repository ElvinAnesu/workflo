-- 0004: company-scoped employment types and employee categories.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0004_employment_types_categories.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0004')
BEGIN
    PRINT N'0004_employment_types_categories already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.employment_types (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    name        NVARCHAR(200)     NOT NULL,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_employment_types_created_at DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL CONSTRAINT df_employment_types_updated_at DEFAULT SYSUTCDATETIME(),
    created_by  INT               NULL,
    updated_by  INT               NULL,
    CONSTRAINT pk_employment_types PRIMARY KEY (id),
    CONSTRAINT uq_employment_types_company_name UNIQUE (company_id, name),
    CONSTRAINT ck_employment_types_name_not_blank CHECK (LEN(name) > 0),
    CONSTRAINT fk_employment_types_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_employment_types_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_employment_types_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_employment_types_company_id ON dbo.employment_types (company_id);

CREATE TABLE dbo.employee_categories (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    name        NVARCHAR(200)     NOT NULL,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_employee_categories_created_at DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL CONSTRAINT df_employee_categories_updated_at DEFAULT SYSUTCDATETIME(),
    created_by  INT               NULL,
    updated_by  INT               NULL,
    CONSTRAINT pk_employee_categories PRIMARY KEY (id),
    CONSTRAINT uq_employee_categories_company_name UNIQUE (company_id, name),
    CONSTRAINT ck_employee_categories_name_not_blank CHECK (LEN(name) > 0),
    CONSTRAINT fk_employee_categories_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_employee_categories_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_employee_categories_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_employee_categories_company_id ON dbo.employee_categories (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0004');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
