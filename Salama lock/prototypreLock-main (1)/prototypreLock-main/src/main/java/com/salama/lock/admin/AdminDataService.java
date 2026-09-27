package com.salama.lock.admin;

import com.salama.lock.domain.entity.ApiKey;
import com.salama.lock.domain.entity.AuditLog;
import com.salama.lock.domain.entity.Command;
import com.salama.lock.domain.entity.Company;
import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.entity.GoogleCallback;
import com.salama.lock.domain.entity.ProviderConfig;
import com.salama.lock.domain.entity.SystemConfig;
import com.salama.lock.domain.repository.ApiKeyRepository;
import com.salama.lock.domain.repository.AuditLogRepository;
import com.salama.lock.domain.repository.CommandRepository;
import com.salama.lock.domain.repository.CompanyRepository;
import com.salama.lock.domain.repository.DeviceRepository;
import com.salama.lock.domain.repository.GoogleCallbackRepository;
import com.salama.lock.domain.repository.ProviderConfigRepository;
import com.salama.lock.domain.repository.SystemConfigRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AdminDataService {

    private final CompanyRepository companyRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final DeviceRepository deviceRepository;
    private final CommandRepository commandRepository;
    private final AuditLogRepository auditLogRepository;
    private final GoogleCallbackRepository googleCallbackRepository;
    private final ProviderConfigRepository providerConfigRepository;
    private final SystemConfigRepository systemConfigRepository;

    @Transactional(readOnly = true)
    public Map<String, Object> overview() {
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("companies", companyRepository.count());
        counts.put("api_keys", apiKeyRepository.count());
        counts.put("devices", deviceRepository.count());
        counts.put("commands", commandRepository.count());
        counts.put("audit_logs", auditLogRepository.count());
        counts.put("google_callbacks", googleCallbackRepository.count());
        counts.put("provider_configs", providerConfigRepository.count());
        counts.put("system_configs", systemConfigRepository.count());
        return counts;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> companies() {
        return companyRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(this::companyRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> apiKeys() {
        return apiKeyRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(this::apiKeyRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> devices() {
        return deviceRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(this::deviceRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> commands(int limit) {
        int size = Math.min(Math.max(limit, 1), 200);
        return commandRepository
                .findAll(PageRequest.of(0, size, Sort.by(Sort.Direction.DESC, "createdAt")))
                .stream()
                .map(this::commandRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> auditLogs(int limit) {
        int size = Math.min(Math.max(limit, 1), 200);
        return auditLogRepository
                .findAll(PageRequest.of(0, size, Sort.by(Sort.Direction.DESC, "createdAt")))
                .stream()
                .map(this::auditRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> googleCallbacks() {
        return googleCallbackRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(this::callbackRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> providerConfigs() {
        return providerConfigRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(this::providerRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> systemConfigs() {
        return systemConfigRepository.findAll(Sort.by(Sort.Direction.ASC, "configKey")).stream()
                .map(this::systemRow)
                .toList();
    }

    @Transactional
    public Map<String, Object> resetBusinessData() {
        long callbacks = googleCallbackRepository.count();
        long audits = auditLogRepository.count();
        long commands = commandRepository.count();
        long devices = deviceRepository.count();
        long keys = apiKeyRepository.count();
        long companies = companyRepository.count();

        googleCallbackRepository.deleteAllInBatch();
        auditLogRepository.deleteAllInBatch();
        commandRepository.deleteAllInBatch();
        deviceRepository.deleteAllInBatch();
        apiKeyRepository.deleteAllInBatch();

        providerConfigRepository.findAll().stream()
                .filter(p -> p.getCompany() != null)
                .forEach(providerConfigRepository::delete);

        companyRepository.deleteAllInBatch();

        Map<String, Object> deleted = new LinkedHashMap<>();
        deleted.put("google_callbacks", callbacks);
        deleted.put("audit_logs", audits);
        deleted.put("commands", commands);
        deleted.put("devices", devices);
        deleted.put("api_keys", keys);
        deleted.put("companies", companies);
        deleted.put("message", "Business data cleared. system_configs and global provider config kept.");
        return deleted;
    }

    private Map<String, Object> companyRow(Company c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", c.getId());
        row.put("name", c.getName());
        row.put("code", c.getCode());
        row.put("status", c.getStatus());
        row.put("contact_email", c.getContactEmail());
        row.put("created_at", c.getCreatedAt());
        return row;
    }

    private Map<String, Object> apiKeyRow(ApiKey k) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", k.getId());
        row.put("company_id", k.getCompany().getId());
        row.put("company_code", k.getCompany().getCode());
        row.put("name", k.getName());
        row.put("key_prefix", k.getKeyPrefix());
        row.put("key_hash", mask(k.getKeyHash()));
        row.put("status", k.getStatus());
        row.put("scopes", k.getScopes());
        row.put("last_used_at", k.getLastUsedAt());
        row.put("created_at", k.getCreatedAt());
        return row;
    }

    private Map<String, Object> deviceRow(Device d) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", d.getId());
        row.put("company_id", d.getCompany().getId());
        row.put("company_code", d.getCompany().getCode());
        row.put("imei", d.getImei());
        row.put("lock_id", d.getLockId());
        row.put("device_type", d.getDeviceType());
        row.put("status", d.getStatus());
        row.put("manufacturer", d.getManufacturer());
        row.put("model", d.getModel());
        row.put("created_at", d.getCreatedAt());
        row.put("updated_at", d.getUpdatedAt());
        return row;
    }

    private Map<String, Object> commandRow(Command c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", c.getId());
        row.put("company_id", c.getCompany().getId());
        row.put("device_id", c.getDevice().getId());
        row.put("imei", c.getDevice().getImei());
        row.put("lock_id", c.getDevice().getLockId());
        row.put("command_type", c.getCommandType());
        row.put("status", c.getStatus());
        row.put("provider", c.getProvider());
        row.put("idempotency_key", c.getIdempotencyKey());
        row.put("external_ref", c.getExternalRef());
        row.put("retry_count", c.getRetryCount());
        row.put("provider_request_id", c.getProviderRequestId());
        row.put("provider_response", c.getProviderResponse());
        row.put("error_code", c.getErrorCode());
        row.put("error_message", c.getErrorMessage());
        row.put("queued_at", c.getQueuedAt());
        row.put("started_at", c.getStartedAt());
        row.put("completed_at", c.getCompletedAt());
        row.put("next_retry_at", c.getNextRetryAt());
        row.put("created_at", c.getCreatedAt());
        return row;
    }

    private Map<String, Object> auditRow(AuditLog a) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", a.getId());
        row.put("company_id", a.getCompany() != null ? a.getCompany().getId() : null);
        row.put("actor_type", a.getActorType());
        row.put("action", a.getAction());
        row.put("http_method", a.getHttpMethod());
        row.put("path", a.getPath());
        row.put("status_code", a.getStatusCode());
        row.put("duration_ms", a.getDurationMs());
        row.put("correlation_id", a.getCorrelationId());
        row.put("created_at", a.getCreatedAt());
        return row;
    }

    private Map<String, Object> callbackRow(GoogleCallback g) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", g.getId());
        row.put("lock_id", g.getLockId());
        row.put("event_type", g.getEventType());
        row.put("provider_event_id", g.getProviderEventId());
        row.put("processed", g.isProcessed());
        row.put("raw_payload", g.getRawPayload());
        row.put("created_at", g.getCreatedAt());
        return row;
    }

    private Map<String, Object> providerRow(ProviderConfig p) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", p.getId());
        row.put("company_id", p.getCompany() != null ? p.getCompany().getId() : null);
        row.put("provider", p.getProvider());
        row.put("name", p.getName());
        row.put("base_url", p.getBaseUrl());
        row.put("config_json", p.getConfigJson());
        row.put("is_active", p.isActive());
        row.put("is_default", p.isDefault());
        return row;
    }

    private Map<String, Object> systemRow(SystemConfig s) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("config_key", s.getConfigKey());
        row.put("config_value", s.getConfigValue());
        row.put("value_type", s.getValueType());
        row.put("description", s.getDescription());
        return row;
    }

    private String mask(String hash) {
        if (hash == null || hash.length() < 12) {
            return "********";
        }
        return hash.substring(0, 8) + "…" + hash.substring(hash.length() - 4);
    }
}
