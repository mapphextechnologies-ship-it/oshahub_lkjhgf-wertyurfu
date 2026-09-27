package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.enums.DeviceStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

    Optional<Device> findByLockId(String lockId);

    Optional<Device> findByCompanyIdAndLockId(UUID companyId, String lockId);

    Optional<Device> findByIdAndCompanyId(UUID id, UUID companyId);

    List<Device> findByCompanyId(UUID companyId);

    List<Device> findByCompanyIdAndStatus(UUID companyId, DeviceStatus status);

    boolean existsByLockId(String lockId);

    /**
     * Legacy column lookup — prefer identifier-based lookups for new code.
     */
    @Deprecated
    Optional<Device> findByCompanyIdAndImei(UUID companyId, String imei);

    @Deprecated
    Optional<Device> findByImei(String imei);

    @Deprecated
    boolean existsByCompanyIdAndImei(UUID companyId, String imei);

    @Query("""
            SELECT DISTINCT d FROM Device d
            LEFT JOIN FETCH d.identifiers
            WHERE d.company.id = :companyId
            """)
    List<Device> findByCompanyIdWithIdentifiers(@Param("companyId") UUID companyId);

    @Query("""
            SELECT d FROM Device d
            LEFT JOIN FETCH d.identifiers
            WHERE d.company.id = :companyId AND d.lockId = :lockId
            """)
    Optional<Device> findByCompanyIdAndLockIdWithIdentifiers(
            @Param("companyId") UUID companyId,
            @Param("lockId") String lockId);

    @Query("""
            SELECT d FROM Device d
            LEFT JOIN FETCH d.identifiers
            WHERE d.id = :id
            """)
    Optional<Device> findByIdWithIdentifiers(@Param("id") UUID id);
}
