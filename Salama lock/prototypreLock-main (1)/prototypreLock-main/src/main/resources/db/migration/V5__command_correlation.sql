-- Persist partner correlation id on commands for tracing across poll requests
ALTER TABLE commands
    ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_commands_correlation
    ON commands (correlation_id)
    WHERE correlation_id IS NOT NULL;
