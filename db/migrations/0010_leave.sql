-- 0010: company-scoped leave types, balances and requests.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0010_leave.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0010')
BEGIN
    PRINT N'0010_leave already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.leave_types (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    name          NVARCHAR(200)     NOT NULL,
    days_per_year INT               NOT NULL,
    paid_unpaid   NVARCHAR(20)      NOT NULL,
    applies_to    NVARCHAR(30)      NOT NULL,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT df_leave_types_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)      NOT NULL CONSTRAINT df_leave_types_updated_at DEFAULT SYSUTCDATETIME(),
    created_by    INT               NULL,
    updated_by    INT               NULL,
    CONSTRAINT pk_leave_types PRIMARY KEY (id),
    CONSTRAINT uq_leave_types_company_name UNIQUE (company_id, name),
    CONSTRAINT uq_leave_types_id_company UNIQUE (id, company_id),
    CONSTRAINT ck_leave_types_name_not_blank CHECK (LEN(name) > 0),
    CONSTRAINT ck_leave_types_days_per_year CHECK (days_per_year BETWEEN 0 AND 366),
    CONSTRAINT ck_leave_types_paid_unpaid CHECK (paid_unpaid IN (N'Paid', N'Unpaid')),
    CONSTRAINT ck_leave_types_applies_to CHECK (applies_to IN (N'Everyone', N'Assign as needed')),
    CONSTRAINT fk_leave_types_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_leave_types_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_leave_types_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_leave_types_company_id ON dbo.leave_types (company_id);
GO

CREATE TABLE dbo.leave_balances (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    employee_id   INT               NOT NULL,
    leave_type_id INT               NOT NULL,
    year          INT               NOT NULL,
    entitled      DECIMAL(6,2)      NOT NULL,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT df_leave_balances_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)      NOT NULL CONSTRAINT df_leave_balances_updated_at DEFAULT SYSUTCDATETIME(),
    created_by    INT               NULL,
    updated_by    INT               NULL,
    CONSTRAINT pk_leave_balances PRIMARY KEY (id),
    CONSTRAINT uq_leave_balances_employee_type_year UNIQUE (company_id, employee_id, leave_type_id, year),
    CONSTRAINT ck_leave_balances_year CHECK (year BETWEEN 2000 AND 2100),
    CONSTRAINT ck_leave_balances_entitled CHECK (entitled >= 0 AND entitled <= 366),
    CONSTRAINT fk_leave_balances_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id),
    CONSTRAINT fk_leave_balances_leave_type FOREIGN KEY (leave_type_id, company_id) REFERENCES dbo.leave_types (id, company_id),
    CONSTRAINT fk_leave_balances_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_leave_balances_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_leave_balances_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_leave_balances_company_id ON dbo.leave_balances (company_id);
GO

CREATE TABLE dbo.leave_requests (
    id            INT IDENTITY(1,1) NOT NULL,
    company_id    INT               NOT NULL,
    employee_id   INT               NOT NULL,
    leave_type_id INT               NOT NULL,
    start_date    DATE              NOT NULL,
    end_date      DATE              NOT NULL,
    days          INT               NOT NULL,
    note          NVARCHAR(1000)    NOT NULL CONSTRAINT df_leave_requests_note DEFAULT (N''),
    status        NVARCHAR(20)      NOT NULL,
    decided_by    INT               NULL,
    decided_on    DATE              NULL,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT df_leave_requests_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)      NOT NULL CONSTRAINT df_leave_requests_updated_at DEFAULT SYSUTCDATETIME(),
    created_by    INT               NULL,
    updated_by    INT               NULL,
    CONSTRAINT pk_leave_requests PRIMARY KEY (id),
    CONSTRAINT ck_leave_requests_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_leave_requests_days CHECK (days > 0),
    CONSTRAINT ck_leave_requests_status CHECK (status IN (N'Pending', N'Approved', N'Rejected')),
    CONSTRAINT ck_leave_requests_decision CHECK (
        (status = N'Pending' AND decided_by IS NULL AND decided_on IS NULL)
        OR (status IN (N'Approved', N'Rejected') AND decided_by IS NOT NULL AND decided_on IS NOT NULL)
    ),
    CONSTRAINT fk_leave_requests_employee FOREIGN KEY (employee_id, company_id) REFERENCES dbo.employees (id, company_id),
    CONSTRAINT fk_leave_requests_leave_type FOREIGN KEY (leave_type_id, company_id) REFERENCES dbo.leave_types (id, company_id),
    CONSTRAINT fk_leave_requests_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_leave_requests_decided_by FOREIGN KEY (decided_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_leave_requests_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_leave_requests_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_leave_requests_company_id ON dbo.leave_requests (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0010');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
