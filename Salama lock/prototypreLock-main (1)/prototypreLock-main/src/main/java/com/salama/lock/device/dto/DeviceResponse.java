package com.salama.lock.device.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.salama.lock.domain.enums.DeviceStatus;
import com.salama.lock.domain.enums.DeviceType;
import com.salama.lock.domain.enums.IdentifierType;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.Builder;
import lombok.Getter;

/**
 * Partner-facing device view. External identity is {@link #lockId} only —
 * internal UUID is never serialized.
 */
@Getter
@Builder
public class DeviceResponse {

    @JsonIgnore
    private final UUID id;

    private final String lockId;
    private final DeviceStatus status;

    /** Primary IMEI (legacy field). Prefer {@link #imei1}. */
    private final String imei;

    private final String imei1;
    private final String imei2;
    private final String serialNumber;
    private final String googleDeviceId;
    private final String googleLockId;
    private final DeviceType deviceType;
    private final String manufacturer;
    private final String model;
    private final Map<String, Object> metadata;
    private final List<IdentifierView> identifiers;
    private final Instant registeredAt;
    private final Instant deactivatedAt;
    private final Instant createdAt;
    private final Instant updatedAt;

    @Getter
    @Builder
    public static class IdentifierView {
        private final IdentifierType type;
        private final String value;
        private final boolean primary;
    }
}
