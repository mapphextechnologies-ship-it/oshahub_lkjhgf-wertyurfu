-- Seed system configs and a global mock Google DLC provider config.

INSERT INTO system_configs (config_key, config_value, value_type, description) VALUES
    ('provider.active', 'MOCK_GOOGLE_DLC', 'STRING', 'Active provider implementation: MOCK_GOOGLE_DLC | GOOGLE_DLC'),
    ('retry.delays_seconds', '[30,60,300,900]', 'JSON', 'Backoff delays between command retries'),
    ('queue.batch_size', '20', 'INT', 'Max commands claimed per worker poll'),
    ('queue.enabled', 'true', 'BOOLEAN', 'Enable/disable command queue worker'),
    ('audit.http_enabled', 'true', 'BOOLEAN', 'Persist HTTP request/response audit rows');

INSERT INTO provider_configs (company_id, provider, name, base_url, config_json, is_active, is_default)
VALUES (
    NULL,
    'GOOGLE_DLC',
    'Global Mock Google DLC',
    'http://localhost:8080/mock/google-dlc',
    '{"mode":"mock","supports_async_callback":true}'::jsonb,
    TRUE,
    TRUE
);
