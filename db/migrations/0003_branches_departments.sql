-- 0003: company-scoped branches and departments.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0003_branches_departments.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0003')
BEGIN
    PRINT N'0003_branches_departments already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.branches (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    name        NVARCHAR(200)     NOT NULL,
    location    NVARCHAR(200)     NULL,
    is_active   BIT               NOT NULL CONSTRAINT df_branches_is_active DEFAULT 1,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_branches_created_at DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL CONSTRAINT df_branches_updated_at DEFAULT SYSUTCDATETIME(),
    created_by  INT               NULL,
    updated_by  INT               NULL,
    CONSTRAINT pk_branches PRIMARY KEY (id),
    CONSTRAINT uq_branches_company_name UNIQUE (company_id, name),
    CONSTRAINT ck_branches_name_not_blank CHECK (LEN(name) > 0),
    CONSTRAINT fk_branches_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_branches_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_branches_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_branches_company_id ON dbo.branches (company_id);

CREATE TABLE dbo.departments (
    id          INT IDENTITY(1,1) NOT NULL,
    company_id  INT               NOT NULL,
    name        NVARCHAR(200)     NOT NULL,
    description NVARCHAR(50)      NULL,
    is_active   BIT               NOT NULL CONSTRAINT df_departments_is_active DEFAULT 1,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_departments_created_at DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL CONSTRAINT df_departments_updated_at DEFAULT SYSUTCDATETIME(),
    created_by  INT               NULL,
    updated_by  INT               NULL,
    CONSTRAINT pk_departments PRIMARY KEY (id),
    CONSTRAINT uq_departments_company_name UNIQUE (company_id, name),
    CONSTRAINT ck_departments_name_not_blank CHECK (LEN(name) > 0),
    CONSTRAINT ck_departments_code_not_blank CHECK (description IS NULL OR LEN(description) > 0),
    CONSTRAINT fk_departments_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_departments_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_departments_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_departments_company_id ON dbo.departments (company_id);

CREATE UNIQUE INDEX uq_departments_company_code
    ON dbo.departments (company_id, description)
    WHERE description IS NOT NULL;

INSERT INTO dbo.schema_migrations (version) VALUES (N'0003');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
