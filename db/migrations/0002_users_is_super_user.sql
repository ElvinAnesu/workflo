-- 0002: super-user flag on dbo.users.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0002_users_is_super_user.sql
-- Safe to run twice.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0002')
BEGIN
    PRINT N'0002_users_is_super_user already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

IF COL_LENGTH(N'dbo.users', N'is_super_user') IS NULL
BEGIN
    ALTER TABLE dbo.users
    ADD is_super_user BIT NOT NULL CONSTRAINT df_users_is_super_user DEFAULT 0;
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0002')
    INSERT INTO dbo.schema_migrations (version) VALUES (N'0002');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
