package com.salama.lock.device;

import com.salama.lock.common.exception.BusinessException;
import com.salama.lock.device.dto.DeviceResponse;
import com.salama.lock.device.dto.RegisterDeviceRequest;
import com.salama.lock.domain.entity.Company;
import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.entity.DeviceIdentifier;
import com.salama.lock.domain.enums.DeviceStatus;
import com.salama.lock.domain.enums.DeviceType;
import com.salama.lock.domain.enums.IdentifierType;
import com.salama.lock.domain.repository.CompanyRepository;
import com.salama.lock.domain.repository.DeviceIdentifierRepository;
import com.salama.lock.domain.repository.DeviceRepository;
import com.salama.lock.security.PartnerPrincipal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class DeviceService {

    private final DeviceRepository deviceRepository;
    private final DeviceIdentifierRepository deviceIdentifierRepository;
    private final CompanyRepository companyRepository;
    private final LockIdGenerator lockIdGenerator;

    @Transactional
    public DeviceResponse register(PartnerPrincipal principal, RegisterDeviceRequest request) {
        Company company = companyRepository
                .findById(principal.getCompanyId())
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "COMPANY_NOT_FOUND", "Company not found"));

        String imei1 = request.resolveImei1();
        String imei2 = StringUtils.hasText(request.getImei2()) ? request.getImei2() : null;

        assertIdentifierAvailable(company.getId(), IdentifierType.IMEI, imei1);
        if (imei2 != null) {
            assertIdentifierAvailable(company.getId(), IdentifierType.IMEI, imei2);
        }

        String lockId = nextUniqueLockId();

        Device device = Device.builder()
                .company(company)
                .imei(imei1)
                .lockId(lockId)
                .serialNumber(request.getSerialNumber())
                .deviceType(request.getDeviceType() != null ? request.getDeviceType() : DeviceType.PHONE)
                .status(DeviceStatus.REGISTERED)
                .manufacturer(request.getManufacturer())
                .model(request.getModel())
                .metadata(request.getMetadata() != null ? request.getMetadata() : new HashMap<>())
                .registeredAt(Instant.now())
                .build();

        device.addIdentifier(DeviceIdentifier.builder()
                .companyId(company.getId())
                .identifierType(IdentifierType.IMEI)
                .identifierValue(imei1)
                .primary(true)
                .build());

        if (imei2 != null) {
            device.addIdentifier(DeviceIdentifier.builder()
                    .companyId(company.getId())
                    .identifierType(IdentifierType.IMEI)
                    .identifierValue(imei2)
                    .primary(false)
                    .build());
        }

        addOptionalIdentifier(device, company.getId(), IdentifierType.SERIAL, request.getSerialNumber());
        addOptionalIdentifier(device, company.getId(), IdentifierType.GOOGLE_DEVICE_ID, request.getGoogleDeviceId());
        addOptionalIdentifier(device, company.getId(), IdentifierType.GOOGLE_LOCK_ID, request.getGoogleLockId());

        return toResponse(deviceRepository.save(device));
    }

    @Transactional(readOnly = true)
    public DeviceResponse getByLockId(PartnerPrincipal principal, String lockId) {
        Device device = deviceRepository
                .findByCompanyIdAndLockIdWithIdentifiers(principal.getCompanyId(), lockId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "Device not found"));
        return toResponse(device);
    }

    @Transactional(readOnly = true)
    public DeviceResponse getByImei(PartnerPrincipal principal, String imei) {
        Device device = deviceIdentifierRepository
                .findDeviceByCompanyAndIdentifier(principal.getCompanyId(), IdentifierType.IMEI, imei)
                .or(() -> deviceRepository.findByCompanyIdAndImei(principal.getCompanyId(), imei))
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "Device not found"));
        return toResponse(ensureIdentifiersLoaded(device));
    }

    @Transactional(readOnly = true)
    public List<DeviceResponse> list(PartnerPrincipal principal) {
        return deviceRepository.findByCompanyIdWithIdentifiers(principal.getCompanyId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public DeviceResponse deactivate(PartnerPrincipal principal, String lockId) {
        Device device = deviceRepository
                .findByCompanyIdAndLockIdWithIdentifiers(principal.getCompanyId(), lockId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "Device not found"));

        if (device.getStatus() == DeviceStatus.DEACTIVATED || device.getStatus() == DeviceStatus.RETIRED) {
            return toResponse(device);
        }

        device.setStatus(DeviceStatus.DEACTIVATED);
        device.setDeactivatedAt(Instant.now());
        return toResponse(device);
    }

    @Transactional
    public void updateStatus(UUID deviceId, DeviceStatus status) {
        Device device = deviceRepository
                .findById(deviceId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "Device not found"));
        device.setStatus(status);
    }

    public DeviceResponse toResponse(Device device) {
        String imei1 = device.primaryImei().orElse(device.getImei());
        String imei2 = device.secondaryImei().orElse(null);
        List<DeviceResponse.IdentifierView> identifierViews = device.getIdentifiers() == null
                ? List.of()
                : device.getIdentifiers().stream()
                        .map(i -> DeviceResponse.IdentifierView.builder()
                                .type(i.getIdentifierType())
                                .value(i.getIdentifierValue())
                                .primary(i.isPrimary())
                                .build())
                        .toList();

        return DeviceResponse.builder()
                .id(device.getId())
                .imei(imei1)
                .imei1(imei1)
                .imei2(imei2)
                .lockId(device.getLockId())
                .serialNumber(device.getSerialNumber())
                .googleDeviceId(device.identifierValue(IdentifierType.GOOGLE_DEVICE_ID).orElse(null))
                .googleLockId(device.identifierValue(IdentifierType.GOOGLE_LOCK_ID).orElse(null))
                .deviceType(device.getDeviceType())
                .status(device.getStatus())
                .manufacturer(device.getManufacturer())
                .model(device.getModel())
                .metadata(device.getMetadata())
                .identifiers(identifierViews)
                .registeredAt(device.getRegisteredAt())
                .deactivatedAt(device.getDeactivatedAt())
                .createdAt(device.getCreatedAt())
                .updatedAt(device.getUpdatedAt())
                .build();
    }

    private void addOptionalIdentifier(Device device, UUID companyId, IdentifierType type, String value) {
        if (!StringUtils.hasText(value)) {
            return;
        }
        assertIdentifierAvailable(companyId, type, value);
        device.addIdentifier(DeviceIdentifier.builder()
                .companyId(companyId)
                .identifierType(type)
                .identifierValue(value)
                .primary(false)
                .build());
    }

    private void assertIdentifierAvailable(UUID companyId, IdentifierType type, String value) {
        if (deviceIdentifierRepository.existsActiveByCompanyAndTypeAndValue(companyId, type, value)) {
            throw new BusinessException(
                    HttpStatus.CONFLICT,
                    "DEVICE_EXISTS",
                    "Identifier already registered to an active device for this company");
        }
    }

    private String nextUniqueLockId() {
        for (int attempt = 0; attempt < 8; attempt++) {
            String candidate = lockIdGenerator.generate();
            if (!deviceRepository.existsByLockId(candidate)) {
                return candidate;
            }
        }
        throw new BusinessException(
                HttpStatus.INTERNAL_SERVER_ERROR, "LOCK_ID_GENERATION_FAILED", "Unable to allocate unique lock_id");
    }

    private Device ensureIdentifiersLoaded(Device device) {
        if (device.getIdentifiers() == null || device.getIdentifiers().isEmpty()) {
            return deviceRepository.findByIdWithIdentifiers(device.getId()).orElse(device);
        }
        return device;
    }
}
