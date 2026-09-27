package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.ApiKey;
import com.salama.lock.domain.enums.ApiKeyStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {

    Optional<ApiKey> findByKeyHashAndStatus(String keyHash, ApiKeyStatus status);

    @Query("""
            SELECT a FROM ApiKey a
            JOIN FETCH a.company c
            WHERE a.keyHash = :keyHash
              AND a.status = :status
            """)
    Optional<ApiKey> findActiveWithCompany(
            @Param("keyHash") String keyHash,
            @Param("status") ApiKeyStatus status);

    List<ApiKey> findByCompanyId(UUID companyId);

    Optional<ApiKey> findByKeyPrefixAndKeyHash(String keyPrefix, String keyHash);
}
