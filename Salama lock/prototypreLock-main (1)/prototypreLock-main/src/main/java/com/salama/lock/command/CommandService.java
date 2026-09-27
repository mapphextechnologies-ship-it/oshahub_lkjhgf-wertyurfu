package com.salama.lock.command;

import com.salama.lock.command.dto.CommandResponse;
import com.salama.lock.command.dto.LockUnlockRequest;
import com.salama.lock.common.exception.BusinessException;
import com.salama.lock.config.SalamaProperties;
import com.salama.lock.domain.entity.Command;
import com.salama.lock.domain.entity.Company;
import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.enums.CommandStatus;
import com.salama.lock.domain.enums.CommandType;
import com.salama.lock.domain.enums.IdentifierType;
import com.salama.lock.domain.enums.ProviderType;
import com.salama.lock.domain.repository.CommandRepository;
import com.salama.lock.domain.repository.CompanyRepository;
import com.salama.lock.domain.repository.DeviceIdentifierRepository;
import com.salama.lock.domain.repository.DeviceRepository;
import com.salama.lock.security.PartnerPrincipal;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class CommandService {

    private final CommandRepository commandRepository;
    private final DeviceRepository deviceRepository;
    private final DeviceIdentifierRepository deviceIdentifierRepository;
    private final CompanyRepository companyRepository;
    private final SalamaProperties properties;

    @Transactional
    public CommandResponse enqueueLock(PartnerPrincipal principal, LockUnlockRequest request, String correlationId) {
        return enqueue(principal, request, CommandType.LOCK, correlationId);
    }

    @Transactional
    public CommandResponse enqueueUnlock(PartnerPrincipal principal, LockUnlockRequest request, String correlationId) {
        return enqueue(principal, request, CommandType.UNLOCK, correlationId);
    }

    @Transactional(readOnly = true)
    public CommandResponse getStatus(PartnerPrincipal principal, UUID commandId) {
        Command command = commandRepository
                .findByIdAndCompanyId(commandId, principal.getCompanyId())
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "COMMAND_NOT_FOUND", "Command not found"));
        return toResponse(command);
    }

    private CommandResponse enqueue(
            PartnerPrincipal principal, LockUnlockRequest request, CommandType type, String correlationId) {
        if (StringUtils.hasText(request.getIdempotencyKey())) {
            var existing = commandRepository.findByCompanyIdAndIdempotencyKey(
                    principal.getCompanyId(), request.getIdempotencyKey());
            if (existing.isPresent()) {
                return toResponse(existing.get());
            }
        }

        Company company = companyRepository
                .findById(principal.getCompanyId())
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "COMPANY_NOT_FOUND", "Company not found"));

        Device device = resolveDevice(principal.getCompanyId(), request);

        if (!device.getStatus().acceptsCommands()) {
            throw new BusinessException(
                    HttpStatus.CONFLICT,
                    "DEVICE_NOT_COMMANDABLE",
                    "Cannot command a device in status " + device.getStatus());
        }

        Command command = Command.builder()
                .company(company)
                .device(device)
                .commandType(type)
                .status(CommandStatus.PENDING)
                .provider(ProviderType.GOOGLE_DLC)
                .idempotencyKey(request.getIdempotencyKey())
                .externalRef(request.getExternalRef())
                .correlationId(StringUtils.hasText(correlationId) ? correlationId : null)
                .requestedBy(principal.getApiKeyId().toString())
                .queuedAt(Instant.now())
                .build();

        return toResponse(commandRepository.save(command));
    }

    private Device resolveDevice(UUID companyId, LockUnlockRequest request) {
        if (StringUtils.hasText(request.getLockId())) {
            Device byLockId = deviceRepository
                    .findByCompanyIdAndLockIdWithIdentifiers(companyId, request.getLockId())
                    .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "Device not found"));

            if (StringUtils.hasText(request.getImei())) {
                String primary = byLockId.primaryImei().orElse(byLockId.getImei());
                boolean matches = request.getImei().equals(primary)
                        || byLockId.getIdentifiers().stream()
                                .filter(i -> i.getIdentifierType() == IdentifierType.IMEI)
                                .anyMatch(i -> request.getImei().equals(i.getIdentifierValue()));
                if (!matches) {
                    throw new BusinessException(
                            HttpStatus.BAD_REQUEST, "LOCK_ID_MISMATCH", "imei does not match device for lockId");
                }
            }
            return byLockId;
        }

        if (!properties.getIdentity().isAllowImeiLock()) {
            throw new BusinessException(
                    HttpStatus.BAD_REQUEST,
                    "LOCK_ID_REQUIRED",
                    "lockId is required (IMEI lock fallback is disabled)");
        }

        if (!StringUtils.hasText(request.getImei())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "LOCK_ID_REQUIRED", "lockId or imei is required");
        }

        return deviceIdentifierRepository
                .findDeviceByCompanyAndIdentifier(companyId, IdentifierType.IMEI, request.getImei())
                .or(() -> deviceRepository.findByCompanyIdAndImei(companyId, request.getImei()))
                .map(this::ensureIdentifiers)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "Device not found"));
    }

    private Device ensureIdentifiers(Device device) {
        if (device.getIdentifiers() != null && !device.getIdentifiers().isEmpty()) {
            return device;
        }
        return deviceRepository.findByIdWithIdentifiers(device.getId()).orElse(device);
    }

    public CommandResponse toResponse(Command command) {
        Device device = command.getDevice();
        boolean showRetry = command.getRetryCount() > 0 || command.getStatus() == CommandStatus.RETRYING;
        String commandId = command.getId().toString();
        String lockId = device.getLockId();

        Map<String, String> links = new LinkedHashMap<>();
        links.put("self", "/api/v1/commands/" + commandId);
        links.put("device", "/api/v1/devices/" + lockId);

        return CommandResponse.builder()
                .commandId(commandId)
                .lockId(lockId)
                .commandType(command.getCommandType())
                .status(command.getStatus())
                .provider(command.getProvider())
                .externalRef(command.getExternalRef())
                .idempotencyKey(command.getIdempotencyKey())
                .correlationId(command.getCorrelationId())
                .createdAt(command.getCreatedAt())
                .pollAfterSeconds(pollAfterSeconds(command))
                .retryCount(showRetry ? command.getRetryCount() : null)
                .errorCode(command.getErrorCode())
                .errorMessage(command.getErrorMessage())
                .completedAt(command.getCompletedAt())
                .nextRetryAt(command.getNextRetryAt())
                .links(links)
                .build();
    }

    private Integer pollAfterSeconds(Command command) {
        return switch (command.getStatus()) {
            case PENDING, PROCESSING -> {
                long ms = properties.getQueue().getPollIntervalMs();
                yield (int) Math.max(1L, (ms + 999L) / 1000L);
            }
            case RETRYING -> {
                if (command.getNextRetryAt() != null) {
                    long secs = Duration.between(Instant.now(), command.getNextRetryAt()).getSeconds();
                    yield (int) Math.max(1L, secs);
                }
                List<Long> delays = properties.getRetry().getDelaysSeconds();
                yield delays.isEmpty() ? 30 : delays.get(0).intValue();
            }
            case SUCCESS, FAILED -> null;
        };
    }
}
