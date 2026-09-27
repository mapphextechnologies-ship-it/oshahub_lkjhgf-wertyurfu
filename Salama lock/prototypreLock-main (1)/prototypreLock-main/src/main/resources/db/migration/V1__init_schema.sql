-- =============================================================================
-- Salama Lock — Phase 1 complete schema
-- Tables: companies, api_keys, devices, commands, provider_configs,
--         audit_logs, google_callbacks, system_configs
-- Enums are enforced via CHECK constraints (Java enums are source of truth).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE TABLE companies (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255)    NOT NULL,
    code            VARCHAR(64)     NOT NULL,
    status          VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(64),
    webhook_url     VARCHAR(512),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_companies_code UNIQUE (code),
    CONSTRAINT chk_companies_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE INDEX idx_companies_status ON companies (status);

-- ---------------------------------------------------------------------------
-- api_keys
-- Raw keys are NEVER stored. Only prefix (lookup) + SHA-256 hash.
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL,
    name            VARCHAR(128)    NOT NULL,
    key_prefix      VARCHAR(16)     NOT NULL,
    key_hash        VARCHAR(128)    NOT NULL,
    status          VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
    scopes          VARCHAR(512)    NOT NULL DEFAULT 'devices:read,devices:write,commands:write,commands:read',
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_api_keys_company
        FOREIGN KEY (company_id) REFERENCES companies (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_api_keys_hash UNIQUE (key_hash),
    CONSTRAINT chk_api_keys_status CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED'))
);

CREATE INDEX idx_api_keys_company ON api_keys (company_id);
CREATE INDEX idx_api_keys_prefix ON api_keys (key_prefix);
CREATE INDEX idx_api_keys_status ON api_keys (status);

-- ---------------------------------------------------------------------------
-- devices
-- IMEI unique per company. lock_id maps to Google DLC device identity.
-- ---------------------------------------------------------------------------
CREATE TABLE devices (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL,
    imei            VARCHAR(20)     NOT NULL,
    lock_id         VARCHAR(128),
    serial_number   VARCHAR(128),
    device_type     VARCHAR(32)     NOT NULL DEFAULT 'PHONE',
    status          VARCHAR(32)     NOT NULL DEFAULT 'REGISTERED',
    manufacturer    VARCHAR(128),
    model           VARCHAR(128),
    metadata        JSONB           NOT NULL DEFAULT '{}'::jsonb,
    registered_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deactivated_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_devices_company
        FOREIGN KEY (company_id) REFERENCES companies (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_devices_company_imei UNIQUE (company_id, imei),
    CONSTRAINT uq_devices_lock_id UNIQUE (lock_id),
    CONSTRAINT chk_devices_imei_length CHECK (char_length(imei) BETWEEN 14 AND 17),
    CONSTRAINT chk_devices_type CHECK (device_type IN ('PHONE', 'LAPTOP', 'TABLET', 'OTHER')),
    CONSTRAINT chk_devices_status CHECK (status IN ('REGISTERED', 'UNLOCKED', 'LOCKED', 'DEACTIVATED', 'UNKNOWN'))
);

CREATE INDEX idx_devices_company ON devices (company_id);
CREATE INDEX idx_devices_imei ON devices (imei);
CREATE INDEX idx_devices_status ON devices (status);
CREATE INDEX idx_devices_lock_id ON devices (lock_id) WHERE lock_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- commands
-- Queue + execution ledger for LOCK / UNLOCK against a provider.
-- ---------------------------------------------------------------------------
CREATE TABLE commands (
    id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID            NOT NULL,
    device_id            UUID            NOT NULL,
    command_type         VARCHAR(32)     NOT NULL,
    status               VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
    provider             VARCHAR(32)     NOT NULL DEFAULT 'GOOGLE_DLC',
    idempotency_key      VARCHAR(128),
    external_ref         VARCHAR(128),
    retry_count          INT             NOT NULL DEFAULT 0,
    max_retries          INT             NOT NULL DEFAULT 4,
    next_retry_at        TIMESTAMPTZ,
    provider_request_id  VARCHAR(256),
    provider_response    JSONB,
    error_code           VARCHAR(64),
    error_message        TEXT,
    requested_by         VARCHAR(128),
    queued_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_commands_company
        FOREIGN KEY (company_id) REFERENCES companies (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_commands_device
        FOREIGN KEY (device_id) REFERENCES devices (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_commands_company_idempotency UNIQUE (company_id, idempotency_key),
    CONSTRAINT chk_commands_retry_nonneg CHECK (retry_count >= 0 AND max_retries >= 0),
    CONSTRAINT chk_commands_type CHECK (command_type IN ('LOCK', 'UNLOCK')),
    CONSTRAINT chk_commands_status CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'RETRYING')),
    CONSTRAINT chk_commands_provider CHECK (provider IN ('GOOGLE_DLC'))
);

CREATE INDEX idx_commands_company ON commands (company_id);
CREATE INDEX idx_commands_device ON commands (device_id);
CREATE INDEX idx_commands_status ON commands (status);
CREATE INDEX idx_commands_queue
    ON commands (status, next_retry_at, queued_at)
    WHERE status IN ('PENDING', 'RETRYING');
CREATE INDEX idx_commands_external_ref ON commands (external_ref) WHERE external_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- provider_configs
-- ---------------------------------------------------------------------------
CREATE TABLE provider_configs (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID,
    provider                VARCHAR(32)     NOT NULL DEFAULT 'GOOGLE_DLC',
    name                    VARCHAR(128)    NOT NULL,
    base_url                VARCHAR(512),
    credentials_encrypted   TEXT,
    config_json             JSONB           NOT NULL DEFAULT '{}'::jsonb,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    is_default              BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_provider_configs_company
        FOREIGN KEY (company_id) REFERENCES companies (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_provider_configs_company_provider UNIQUE (company_id, provider),
    CONSTRAINT chk_provider_configs_provider CHECK (provider IN ('GOOGLE_DLC'))
);

CREATE INDEX idx_provider_configs_provider ON provider_configs (provider);
CREATE INDEX idx_provider_configs_active ON provider_configs (is_active) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id               BIGSERIAL       PRIMARY KEY,
    company_id       UUID,
    actor_type       VARCHAR(32)     NOT NULL DEFAULT 'SYSTEM',
    actor_id         VARCHAR(128),
    action           VARCHAR(128)    NOT NULL,
    resource_type    VARCHAR(64),
    resource_id      VARCHAR(64),
    http_method      VARCHAR(16),
    path             VARCHAR(512),
    request_body     JSONB,
    response_body    JSONB,
    status_code      INT,
    ip_address       VARCHAR(64),
    user_agent       VARCHAR(512),
    duration_ms      INT,
    correlation_id   VARCHAR(64),
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_audit_logs_company
        FOREIGN KEY (company_id) REFERENCES companies (id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_audit_logs_actor CHECK (actor_type IN ('API_KEY', 'SYSTEM', 'CALLBACK', 'WORKER', 'ADMIN'))
);

CREATE INDEX idx_audit_logs_company ON audit_logs (company_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_correlation ON audit_logs (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);

-- ---------------------------------------------------------------------------
-- google_callbacks
-- ---------------------------------------------------------------------------
CREATE TABLE google_callbacks (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id          UUID,
    device_id           UUID,
    lock_id             VARCHAR(128),
    event_type          VARCHAR(32)     NOT NULL,
    provider_event_id   VARCHAR(256),
    raw_payload         JSONB           NOT NULL,
    processed           BOOLEAN         NOT NULL DEFAULT FALSE,
    processed_at        TIMESTAMPTZ,
    processing_error    TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_google_callbacks_command
        FOREIGN KEY (command_id) REFERENCES commands (id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_google_callbacks_device
        FOREIGN KEY (device_id) REFERENCES devices (id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT uq_google_callbacks_event_id UNIQUE (provider_event_id),
    CONSTRAINT chk_google_callbacks_event CHECK (event_type IN ('LOCKED', 'UNLOCKED', 'FAILED'))
);

CREATE INDEX idx_google_callbacks_processed ON google_callbacks (processed, created_at)
    WHERE processed = FALSE;
CREATE INDEX idx_google_callbacks_lock_id ON google_callbacks (lock_id) WHERE lock_id IS NOT NULL;
CREATE INDEX idx_google_callbacks_command ON google_callbacks (command_id) WHERE command_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- system_configs
-- ---------------------------------------------------------------------------
CREATE TABLE system_configs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key      VARCHAR(128)    NOT NULL,
    config_value    TEXT            NOT NULL,
    value_type      VARCHAR(32)     NOT NULL DEFAULT 'STRING',
    description     TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_system_configs_key UNIQUE (config_key),
    CONSTRAINT chk_system_configs_value_type
        CHECK (value_type IN ('STRING', 'INT', 'BOOLEAN', 'JSON'))
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_commands_updated_at
    BEFORE UPDATE ON commands
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_provider_configs_updated_at
    BEFORE UPDATE ON provider_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_system_configs_updated_at
    BEFORE UPDATE ON system_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
