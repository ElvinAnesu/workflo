-- 0014: app sessions. The cookie holds a random token; this table stores its SHA-256 hex.
--
--   sqlcmd -S <server> -d <database> -b -i db/migrations/0014_user_sessions.sql
-- Safe to run twice: it records itself in dbo.schema_migrations and skips
-- if it is already there.
-- Requires dbo.users from 0001.

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE version = N'0014')
BEGIN
    PRINT N'0014_user_sessions already applied, skipping.';
    SET NOEXEC ON;
END;
GO

BEGIN TRANSACTION;
GO

CREATE TABLE dbo.user_sessions (
    id          INT IDENTITY(1,1) NOT NULL,
    user_id     INT               NOT NULL,
    token_hash  CHAR(64)          NOT NULL,
    expires_at  DATETIME2(0)      NOT NULL,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT df_user_sessions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_user_sessions PRIMARY KEY (id),
    CONSTRAINT uq_user_sessions_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES dbo.users (id)
);

CREATE INDEX ix_user_sessions_user_id ON dbo.user_sessions (user_id);
GO

INSERT INTO dbo.schema_migrations (version) VALUES (N'0014');
GO

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
