-- =============================================================================
-- Device identity model: internal UUID + permanent lock_id + multi-identifiers
-- =============================================================================

-- Ensure every existing device has a permanent lock_id before making it NOT NULL
UPDATE devices
SET lock_id = 'LOCK-' || imei
WHERE lock_id IS NULL;

ALTER TABLE devices
    ALTER COLUMN lock_id SET NOT NULL;

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS google_device_id VARCHAR(256);

-- Soft-deleted devices must not permanently occupy an IMEI. Active uniqueness
-- is enforced in application code (and via device_identifiers lookups).
ALTER TABLE devices DROP CONSTRAINT IF EXISTS uq_devices_company_imei;
CREATE INDEX IF NOT EXISTS idx_devices_company_imei ON devices (company_id, imei);

-- ---------------------------------------------------------------------------
-- device_identifiers
-- Hardware / platform identifiers belonging to a device (IMEI1/2, serial, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE device_identifiers (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           UUID            NOT NULL,
    identifier_type     VARCHAR(32)     NOT NULL,
    identifier_value    VARCHAR(256)    NOT NULL,
    is_primary          BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_device_identifiers_device
        FOREIGN KEY (device_id) REFERENCES devices (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_device_identifiers_type CHECK (identifier_type IN (
        'IMEI', 'SERIAL', 'GOOGLE_DEVICE_ID', 'ANDROID_ID', 'MAC', 'OTHER'
    )),
    CONSTRAINT chk_device_identifiers_value_len CHECK (char_length(identifier_value) >= 1)
);

CREATE INDEX idx_device_identifiers_type_value
    ON device_identifiers (identifier_type, identifier_value);

CREATE INDEX idx_device_identifiers_device
    ON device_identifiers (device_id);

-- At most one primary identifier per device
CREATE UNIQUE INDEX uq_device_identifiers_one_primary
    ON device_identifiers (device_id)
    WHERE is_primary = TRUE;

-- Backfill primary IMEI from legacy devices.imei column
INSERT INTO device_identifiers (id, device_id, identifier_type, identifier_value, is_primary, created_at)
SELECT gen_random_uuid(), d.id, 'IMEI', d.imei, TRUE, COALESCE(d.created_at, NOW())
FROM devices d
WHERE NOT EXISTS (
    SELECT 1
    FROM device_identifiers di
    WHERE di.device_id = d.id
      AND di.identifier_type = 'IMEI'
      AND di.identifier_value = d.imei
);

-- Backfill serial numbers when present
INSERT INTO device_identifiers (id, device_id, identifier_type, identifier_value, is_primary, created_at)
SELECT gen_random_uuid(), d.id, 'SERIAL', d.serial_number, FALSE, COALESCE(d.created_at, NOW())
FROM devices d
WHERE d.serial_number IS NOT NULL
  AND char_length(trim(d.serial_number)) > 0
  AND NOT EXISTS (
      SELECT 1
      FROM device_identifiers di
      WHERE di.device_id = d.id
        AND di.identifier_type = 'SERIAL'
        AND di.identifier_value = d.serial_number
  );
