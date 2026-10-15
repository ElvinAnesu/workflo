-- 0001: companies, users and which companies each user can access.
--
-- Run with sqlcmd so an error stops the script:
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0001_companies_users.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.schema_migrations (
        version     NVARCHAR(50)  NOT NULL,
        applied_at  DATETIME2(0)  NOT NULL CONSTRAINT df_schema_migrations_applied_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT pk_schema_migrations PRIMARY KEY (version)
    );
END;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0001')
BEGIN
    PRINT N'0001_companies_users already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

-- People who can log in. A user is not tied to one company; access is
-- granted per company in dbo.user_companies.
CREATE TABLE dbo.users (
    id             INT IDENTITY(1,1) NOT NULL,
    username       NVARCHAR(100)     NOT NULL,
    email          NVARCHAR(256)     NOT NULL,
    full_name      NVARCHAR(200)     NULL,
    password_hash  NVARCHAR(255)     NOT NULL,
    is_active      BIT               NOT NULL CONSTRAINT df_users_is_active DEFAULT 1,
    last_login_at  DATETIME2(0)      NULL,
    created_at     DATETIME2(0)      NOT NULL CONSTRAINT df_users_created_at DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2(0)      NOT NULL CONSTRAINT df_users_updated_at DEFAULT SYSUTCDATETIME(),
    created_by     INT               NULL,
    updated_by     INT               NULL,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_username_not_blank CHECK (LEN(username) > 0),
    CONSTRAINT ck_users_email_not_blank CHECK (LEN(email) > 0),
    CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

CREATE TABLE dbo.companies (
    id          INT IDENTITY(1,1) NOT NULL,
    name        NVARCHAR(200)     NOT NULL,
    country     NVARCHAR(100)     NULL,
    address     NVARCHAR(500)     NULL,
    is_active   BIT               NOT NULL CONSTRAINT df_companies_is_active DEFAULT 1,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_companies_created_at DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL CONSTRAINT df_companies_updated_at DEFAULT SYSUTCDATETIME(),
    created_by  INT               NULL,
    updated_by  INT               NULL,
    CONSTRAINT pk_companies PRIMARY KEY (id),
    CONSTRAINT uq_companies_name UNIQUE (name),
    CONSTRAINT ck_companies_name_not_blank CHECK (LEN(name) > 0),
    CONSTRAINT fk_companies_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id),
    CONSTRAINT fk_companies_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (id)
);

-- Which companies a user can open. Granting access inserts a row,
-- revoking it deletes the row.
CREATE TABLE dbo.user_companies (
    user_id     INT           NOT NULL,
    company_id  INT           NOT NULL,
    created_at  DATETIME2(0)  NOT NULL CONSTRAINT df_user_companies_created_at DEFAULT SYSUTCDATETIME(),
    created_by  INT           NULL,
    CONSTRAINT pk_user_companies PRIMARY KEY (user_id, company_id),
    CONSTRAINT fk_user_companies_user FOREIGN KEY (user_id) REFERENCES dbo.users (id),
    CONSTRAINT fk_user_companies_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT fk_user_companies_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (id)
);

CREATE INDEX ix_user_companies_company_id ON dbo.user_companies (company_id);

INSERT INTO dbo.schema_migrations (version) VALUES (N'0001');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
