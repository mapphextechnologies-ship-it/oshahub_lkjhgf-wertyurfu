package com.salama.lock.admin;

import com.salama.lock.domain.entity.AuditLog;
import com.salama.lock.domain.entity.Command;
import com.salama.lock.domain.repository.AuditLogRepository;
import com.salama.lock.domain.repository.CommandRepository;
import com.salama.lock.monitoring.MonitoringService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AdminMonitoringService {

    private final HealthEndpoint healthEndpoint;
    private final MonitoringService monitoringService;
    private final AuditLogRepository auditLogRepository;
    private final CommandRepository commandRepository;

    @Transactional(readOnly = true)
    public Map<String, Object> dashboard(int logLimit) {
        int limit = Math.min(Math.max(logLimit, 1), 200);
        Map<String, Object> dash = new LinkedHashMap<>();
        dash.put("health", healthEndpoint.health());
        dash.put("provider", monitoringService.providerStatus());
        dash.put("queue", monitoringService.queueStatus());
        dash.put("statistics", monitoringService.statistics());
        dash.put("recentCommands", recentCommands(20));
        dash.put("recentLogs", recentLogs(limit));
        return dash;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> logs(int limit) {
        return recentLogs(Math.min(Math.max(limit, 1), 200));
    }

    private List<Map<String, Object>> recentCommands(int limit) {
        return commandRepository
                .findAll(PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "createdAt")))
                .stream()
                .map(this::commandRow)
                .toList();
    }

    private List<Map<String, Object>> recentLogs(int limit) {
        return auditLogRepository
                .findAll(PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "createdAt")))
                .stream()
                .map(this::logRow)
                .toList();
    }

    private Map<String, Object> commandRow(Command c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", c.getId());
        row.put("type", c.getCommandType());
        row.put("status", c.getStatus());
        row.put("imei", c.getDevice().getImei());
        row.put("lock_id", c.getDevice().getLockId());
        row.put("external_ref", c.getExternalRef());
        row.put("retry_count", c.getRetryCount());
        row.put("error_code", c.getErrorCode());
        row.put("error_message", c.getErrorMessage());
        row.put("provider_request_id", c.getProviderRequestId());
        row.put("created_at", c.getCreatedAt());
        row.put("completed_at", c.getCompletedAt());
        return row;
    }

    private Map<String, Object> logRow(AuditLog a) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", a.getId());
        row.put("created_at", a.getCreatedAt());
        row.put("actor_type", a.getActorType());
        row.put("action", a.getAction());
        row.put("http_method", a.getHttpMethod());
        row.put("path", a.getPath());
        row.put("status_code", a.getStatusCode());
        row.put("duration_ms", a.getDurationMs());
        row.put("correlation_id", a.getCorrelationId());
        row.put("company_id", a.getCompany() != null ? a.getCompany().getId() : null);
        row.put("resource_type", a.getResourceType());
        row.put("resource_id", a.getResourceId());
        row.put("request_body", a.getRequestBody());
        row.put("response_body", a.getResponseBody());
        return row;
    }
}
