package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.ProviderConfig;
import com.salama.lock.domain.enums.ProviderType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProviderConfigRepository extends JpaRepository<ProviderConfig, UUID> {

    Optional<ProviderConfig> findByCompanyIdAndProviderAndActiveTrue(UUID companyId, ProviderType provider);

    @Query("""
            SELECT p FROM ProviderConfig p
            WHERE p.provider = :provider
              AND p.active = TRUE
              AND p.company IS NULL
              AND p.isDefault = TRUE
            """)
    Optional<ProviderConfig> findGlobalDefault(@Param("provider") ProviderType provider);
}
