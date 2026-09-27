package com.salama.lock.audit;

import com.salama.lock.domain.entity.AuditLog;
import com.salama.lock.domain.entity.Company;
import com.salama.lock.domain.enums.ActorType;
import com.salama.lock.domain.repository.AuditLogRepository;
import com.salama.lock.domain.repository.CompanyRepository;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final CompanyRepository companyRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
            UUID companyId,
            ActorType actorType,
            String actorId,
            String action,
            String resourceType,
            String resourceId,
            String httpMethod,
            String path,
            Map<String, Object> requestBody,
            Map<String, Object> responseBody,
            Integer statusCode,
            String ipAddress,
            String userAgent,
            Integer durationMs,
            String correlationId) {

        try {
            Company company = companyId != null ? companyRepository.findById(companyId).orElse(null) : null;
            AuditLog entry = AuditLog.builder()
                    .company(company)
                    .actorType(actorType)
                    .actorId(actorId)
                    .action(action)
                    .resourceType(resourceType)
                    .resourceId(resourceId)
                    .httpMethod(httpMethod)
                    .path(path)
                    .requestBody(requestBody)
                    .responseBody(responseBody)
                    .statusCode(statusCode)
                    .ipAddress(ipAddress)
                    .userAgent(userAgent)
                    .durationMs(durationMs)
                    .correlationId(correlationId)
                    .createdAt(Instant.now())
                    .build();
            auditLogRepository.save(entry);
        } catch (Exception ex) {
            log.warn("Failed to write audit log action={}: {}", action, ex.getMessage());
        }
    }
}
