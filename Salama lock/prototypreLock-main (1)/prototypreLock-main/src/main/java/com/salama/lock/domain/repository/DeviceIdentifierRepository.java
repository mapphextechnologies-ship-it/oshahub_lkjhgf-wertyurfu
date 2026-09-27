package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.entity.DeviceIdentifier;
import com.salama.lock.domain.enums.IdentifierType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeviceIdentifierRepository extends JpaRepository<DeviceIdentifier, UUID> {

    List<DeviceIdentifier> findByDeviceId(UUID deviceId);

    List<DeviceIdentifier> findByDeviceIdOrderByCreatedAtAsc(UUID deviceId);

    Optional<DeviceIdentifier> findByDeviceIdAndPrimaryTrue(UUID deviceId);

    Optional<DeviceIdentifier> findFirstByIdentifierTypeAndIdentifierValue(
            IdentifierType identifierType, String identifierValue);

    @Query("""
            SELECT d FROM Device d
            WHERE d.company.id = :companyId
              AND EXISTS (
                  SELECT 1 FROM DeviceIdentifier di
                  WHERE di.device = d
                    AND di.identifierType = :type
                    AND di.identifierValue = :value
              )
            """)
    Optional<Device> findDeviceByCompanyAndIdentifier(
            @Param("companyId") UUID companyId,
            @Param("type") IdentifierType type,
            @Param("value") String value);

    @Query("""
            SELECT d FROM Device d
            WHERE EXISTS (
                  SELECT 1 FROM DeviceIdentifier di
                  WHERE di.device = d
                    AND di.identifierType = :type
                    AND di.identifierValue = :value
              )
            """)
    Optional<Device> findDeviceByIdentifier(
            @Param("type") IdentifierType type,
            @Param("value") String value);

    @Query("""
            SELECT CASE WHEN COUNT(di) > 0 THEN TRUE ELSE FALSE END
            FROM DeviceIdentifier di
            JOIN di.device d
            WHERE di.identifierType = :type
              AND di.identifierValue = :value
              AND d.company.id = :companyId
              AND d.status NOT IN (
                  com.salama.lock.domain.enums.DeviceStatus.DEACTIVATED,
                  com.salama.lock.domain.enums.DeviceStatus.RETIRED
              )
            """)
    boolean existsActiveByCompanyAndTypeAndValue(
            @Param("companyId") UUID companyId,
            @Param("type") IdentifierType type,
            @Param("value") String value);
}
