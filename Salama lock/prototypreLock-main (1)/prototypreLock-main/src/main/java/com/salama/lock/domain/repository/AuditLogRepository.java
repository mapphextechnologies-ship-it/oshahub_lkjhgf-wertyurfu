package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.AuditLog;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    List<AuditLog> findByCompanyIdOrderByCreatedAtDesc(UUID companyId, Pageable pageable);

    List<AuditLog> findByCorrelationIdOrderByCreatedAtAsc(String correlationId);

    List<AuditLog> findByResourceTypeAndResourceIdOrderByCreatedAtDesc(
            String resourceType, String resourceId, Pageable pageable);
}
