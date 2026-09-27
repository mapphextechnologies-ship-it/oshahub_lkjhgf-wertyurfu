-- =============================================================================
-- Identity refinements: ULID-ready lock_id, company-scoped identifiers,
-- Google IDs only in device_identifiers, expanded device lifecycle
-- =============================================================================

-- Drop denormalized Google column; identifiers table is the source of truth
INSERT INTO device_identifiers (id, device_id, identifier_type, identifier_value, is_primary, created_at)
SELECT gen_random_uuid(), d.id, 'GOOGLE_DEVICE_ID', d.google_device_id, FALSE, COALESCE(d.created_at, NOW())
FROM devices d
WHERE d.google_device_id IS NOT NULL
  AND char_length(trim(d.google_device_id)) > 0
  AND NOT EXISTS (
      SELECT 1 FROM device_identifiers di
      WHERE di.device_id = d.id
        AND di.identifier_type = 'GOOGLE_DEVICE_ID'
        AND di.identifier_value = d.google_device_id
  );

ALTER TABLE devices DROP COLUMN IF EXISTS google_device_id;

-- Expand identifier types
ALTER TABLE device_identifiers DROP CONSTRAINT IF EXISTS chk_device_identifiers_type;
ALTER TABLE device_identifiers ADD CONSTRAINT chk_device_identifiers_type CHECK (identifier_type IN (
    'IMEI', 'SERIAL', 'GOOGLE_DEVICE_ID', 'GOOGLE_LOCK_ID', 'ANDROID_ID', 'MAC', 'OTHER'
));

-- Company-scoped uniqueness for identifiers (supports portfolio transfer across tenants)
ALTER TABLE device_identifiers ADD COLUMN IF NOT EXISTS company_id UUID;

UPDATE device_identifiers di
SET company_id = d.company_id
FROM devices d
WHERE di.device_id = d.id
  AND di.company_id IS NULL;

ALTER TABLE device_identifiers
    ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE device_identifiers
    DROP CONSTRAINT IF EXISTS fk_device_identifiers_company;
ALTER TABLE device_identifiers
    ADD CONSTRAINT fk_device_identifiers_company
        FOREIGN KEY (company_id) REFERENCES companies (id)
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_device_identifiers_company_type_value
    ON device_identifiers (company_id, identifier_type, identifier_value);

CREATE INDEX IF NOT EXISTS idx_device_identifiers_company
    ON device_identifiers (company_id);

-- Active uniqueness for (company, type, value) is enforced in DeviceService so soft-deleted
-- / retired devices do not permanently occupy an identifier within the tenant.
-- Cross-company registration of the same IMEI remains allowed (portfolio transfer / migration).

-- Expanded device lifecycle / state
ALTER TABLE devices DROP CONSTRAINT IF EXISTS chk_devices_status;
ALTER TABLE devices ADD CONSTRAINT chk_devices_status CHECK (status IN (
    'REGISTERED', 'ACTIVE', 'UNLOCKED', 'LOCKED', 'SUSPENDED', 'DEACTIVATED', 'RETIRED', 'UNKNOWN'
));
