package com.salama.lock.callback;

import com.salama.lock.audit.AuditService;
import com.salama.lock.callback.dto.GoogleCallbackRequest;
import com.salama.lock.common.exception.BusinessException;
import com.salama.lock.device.DeviceService;
import com.salama.lock.domain.entity.Command;
import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.entity.GoogleCallback;
import com.salama.lock.domain.enums.ActorType;
import com.salama.lock.domain.enums.CallbackEvent;
import com.salama.lock.domain.enums.CommandStatus;
import com.salama.lock.domain.enums.DeviceStatus;
import com.salama.lock.domain.enums.IdentifierType;
import com.salama.lock.domain.repository.CommandRepository;
import com.salama.lock.domain.repository.DeviceIdentifierRepository;
import com.salama.lock.domain.repository.DeviceRepository;
import com.salama.lock.domain.repository.GoogleCallbackRepository;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class GoogleCallbackService {

    private final GoogleCallbackRepository googleCallbackRepository;
    private final DeviceRepository deviceRepository;
    private final DeviceIdentifierRepository deviceIdentifierRepository;
    private final CommandRepository commandRepository;
    private final DeviceService deviceService;
    private final AuditService auditService;

    @Transactional
    public Map<String, Object> handle(GoogleCallbackRequest request) {
        if (StringUtils.hasText(request.getProviderEventId())) {
            Optional<GoogleCallback> existing =
                    googleCallbackRepository.findByProviderEventId(request.getProviderEventId());
            if (existing.isPresent()) {
                return Map.of("status", "DUPLICATE", "id", existing.get().getId().toString());
            }
        }

        Device device = deviceRepository
                .findByLockId(request.getLockId())
                .or(() -> StringUtils.hasText(request.getImei())
                        ? deviceIdentifierRepository.findDeviceByIdentifier(
                                IdentifierType.IMEI, request.getImei())
                        : Optional.empty())
                .or(() -> StringUtils.hasText(request.getImei())
                        ? deviceRepository.findByImei(request.getImei())
                        : Optional.empty())
                .orElseThrow(() -> new BusinessException(
                        HttpStatus.NOT_FOUND, "DEVICE_NOT_FOUND", "No device for callback lock_id/imei"));

        Command command = null;
        if (StringUtils.hasText(request.getCommandId())) {
            command = commandRepository.findById(UUID.fromString(request.getCommandId())).orElse(null);
        }

        Map<String, Object> raw = request.getPayload() != null ? new HashMap<>(request.getPayload()) : new HashMap<>();
        raw.put("eventType", request.getEventType().name());
        raw.put("lockId", request.getLockId());

        GoogleCallback callback = GoogleCallback.builder()
                .command(command)
                .device(device)
                .lockId(request.getLockId())
                .eventType(request.getEventType())
                .providerEventId(request.getProviderEventId())
                .rawPayload(raw)
                .processed(false)
                .createdAt(Instant.now())
                .build();

        googleCallbackRepository.save(callback);
        applyEvent(device, command, request.getEventType());
        callback.setProcessed(true);
        callback.setProcessedAt(Instant.now());

        auditService.record(
                device.getCompany().getId(),
                ActorType.CALLBACK,
                "google",
                "GOOGLE_CALLBACK_" + request.getEventType(),
                "device",
                device.getId().toString(),
                "POST",
                "/api/v1/callback/google",
                raw,
                Map.of("processed", true),
                200,
                null,
                null,
                0,
                callback.getId().toString());

        return Map.of(
                "status", "PROCESSED",
                "id", callback.getId().toString(),
                "deviceStatus", device.getStatus().name());
    }

    private void applyEvent(Device device, Command command, CallbackEvent event) {
        switch (event) {
            case LOCKED -> {
                deviceService.updateStatus(device.getId(), DeviceStatus.LOCKED);
                if (command != null) {
                    command.setStatus(CommandStatus.SUCCESS);
                    command.setCompletedAt(Instant.now());
                }
            }
            case UNLOCKED -> {
                deviceService.updateStatus(device.getId(), DeviceStatus.UNLOCKED);
                if (command != null) {
                    command.setStatus(CommandStatus.SUCCESS);
                    command.setCompletedAt(Instant.now());
                }
            }
            case FAILED -> {
                if (command != null) {
                    command.setStatus(CommandStatus.FAILED);
                    command.setCompletedAt(Instant.now());
                    command.setErrorCode("CALLBACK_FAILED");
                    command.setErrorMessage("Provider reported FAILED via callback");
                }
            }
        }
    }
}
