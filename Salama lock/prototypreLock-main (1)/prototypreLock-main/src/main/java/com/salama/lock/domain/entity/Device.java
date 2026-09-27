package com.salama.lock.domain.entity;

import com.salama.lock.domain.enums.DeviceStatus;
import com.salama.lock.domain.enums.DeviceType;
import com.salama.lock.domain.enums.IdentifierType;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(
        name = "devices",
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_devices_lock_id", columnNames = "lock_id")
        }
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Device extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    /**
     * Denormalized primary IMEI for admin views / legacy lookups.
     * Source of truth for all identifiers is {@link #identifiers}.
     */
    @Column(nullable = false, length = 20)
    private String imei;

    @Column(name = "lock_id", nullable = false, length = 128)
    private String lockId;

    @Column(name = "serial_number", length = 128)
    private String serialNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "device_type", nullable = false)
    @Builder.Default
    private DeviceType deviceType = DeviceType.PHONE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private DeviceStatus status = DeviceStatus.REGISTERED;

    @Column(length = 128)
    private String manufacturer;

    @Column(length = 128)
    private String model;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();

    @Column(name = "registered_at", nullable = false)
    @Builder.Default
    private Instant registeredAt = Instant.now();

    @Column(name = "deactivated_at")
    private Instant deactivatedAt;

    @OneToMany(mappedBy = "device", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    @Builder.Default
    private List<DeviceIdentifier> identifiers = new ArrayList<>();

    public void addIdentifier(DeviceIdentifier identifier) {
        identifiers.add(identifier);
        identifier.setDevice(this);
        if (identifier.getCompanyId() == null && company != null) {
            identifier.setCompanyId(company.getId());
        }
    }

    public Optional<String> primaryImei() {
        return identifiers.stream()
                .filter(DeviceIdentifier::isPrimary)
                .filter(i -> i.getIdentifierType() == IdentifierType.IMEI)
                .map(DeviceIdentifier::getIdentifierValue)
                .findFirst()
                .or(() -> Optional.ofNullable(imei));
    }

    public Optional<String> secondaryImei() {
        List<String> imeis = identifiers.stream()
                .filter(i -> i.getIdentifierType() == IdentifierType.IMEI)
                .map(DeviceIdentifier::getIdentifierValue)
                .toList();
        if (imeis.size() < 2) {
            return Optional.empty();
        }
        String primary = primaryImei().orElse(null);
        return imeis.stream().filter(v -> primary == null || !v.equals(primary)).findFirst();
    }

    public Optional<String> identifierValue(IdentifierType type) {
        return identifiers.stream()
                .filter(i -> i.getIdentifierType() == type)
                .map(DeviceIdentifier::getIdentifierValue)
                .findFirst();
    }

    /** Flat map of identifier type → value for provider payloads (primary IMEI wins for IMEI). */
    public Map<String, String> identifierMap() {
        Map<String, String> map = new LinkedHashMap<>();
        primaryImei().ifPresent(v -> map.put(IdentifierType.IMEI.name(), v));
        for (DeviceIdentifier identifier : identifiers) {
            if (identifier.getIdentifierType() == IdentifierType.IMEI && identifier.isPrimary()) {
                continue;
            }
            if (identifier.getIdentifierType() == IdentifierType.IMEI && map.containsKey(IdentifierType.IMEI.name())) {
                // secondary IMEI exposed under IMEI2 key for providers
                map.putIfAbsent("IMEI2", identifier.getIdentifierValue());
                continue;
            }
            map.putIfAbsent(identifier.getIdentifierType().name(), identifier.getIdentifierValue());
        }
        return map;
    }
}
