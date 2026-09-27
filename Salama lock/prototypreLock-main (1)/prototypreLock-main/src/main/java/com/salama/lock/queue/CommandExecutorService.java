package com.salama.lock.queue;

import com.salama.lock.audit.AuditService;
import com.salama.lock.config.SalamaProperties;
import com.salama.lock.device.DeviceService;
import com.salama.lock.domain.entity.Command;
import com.salama.lock.domain.entity.Device;
import com.salama.lock.domain.enums.ActorType;
import com.salama.lock.domain.enums.CommandStatus;
import com.salama.lock.domain.enums.DeviceStatus;
import com.salama.lock.domain.repository.CommandRepository;
import com.salama.lock.provider.DeviceLockProvider;
import com.salama.lock.provider.ProviderCommandRequest;
import com.salama.lock.provider.ProviderRegistry;
import com.salama.lock.retry.RetryPolicy;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class CommandExecutorService {

    private final CommandRepository commandRepository;
    private final ProviderRegistry providerRegistry;
    private final RetryPolicy retryPolicy;
    private final DeviceService deviceService;
    private final AuditService auditService;
    private final SalamaProperties properties;

    @Transactional
    public List<UUID> claimBatch() {
        List<UUID> ids = commandRepository.claimCandidateIds(
                Instant.now(), properties.getQueue().getBatchSize());
        if (ids.isEmpty()) {
            return List.of();
        }
        commandRepository.markProcessing(
                ids,
                CommandStatus.PROCESSING,
                CommandStatus.PENDING,
                CommandStatus.RETRYING,
                Instant.now());
        return ids;
    }

    @Transactional
    public void processOne(UUID commandId) {
        Command command = commandRepository.findById(commandId).orElse(null);
        if (command == null) {
            return;
        }

        Device device = command.getDevice();
        device.getIdentifiers().size();
        command.getCompany().getId();

        ProviderCommandRequest request = ProviderCommandRequest.builder()
                .lockId(device.getLockId())
                .commandType(command.getCommandType())
                .commandId(command.getId().toString())
                .identifiers(device.identifierMap())
                .metadata(device.getMetadata())
                .build();

        DeviceLockProvider provider = providerRegistry.activeProvider();
        DeviceLockProvider.ProviderResult result = provider.execute(request);
        applyResult(command, result);

        auditService.record(
                command.getCompany().getId(),
                ActorType.WORKER,
                "system",
                "COMMAND_EXECUTE_" + (result.success() ? "SUCCESS" : "FAIL"),
                "command",
                command.getId().toString(),
                null,
                null,
                Map.of(
                        "commandType", command.getCommandType().name(),
                        "schemaVersion", ProviderCommandRequest.CURRENT_VERSION,
                        "retryable", result.retryable(),
                        "errorCode", result.errorCode() == null ? "" : result.errorCode()),
                result.rawResponse(),
                result.success() ? 200 : 502,
                null,
                null,
                0,
                command.getId().toString());
    }

    private void applyResult(Command command, DeviceLockProvider.ProviderResult result) {
        Instant now = Instant.now();
        command.setProviderResponse(result.rawResponse());
        command.setProviderRequestId(result.providerRequestId());

        if (result.success()) {
            command.setStatus(CommandStatus.SUCCESS);
            command.setCompletedAt(now);
            command.setErrorCode(null);
            command.setErrorMessage(null);
            command.setNextRetryAt(null);
            DeviceStatus newStatus =
                    command.getCommandType().name().equals("LOCK") ? DeviceStatus.LOCKED : DeviceStatus.UNLOCKED;
            deviceService.updateStatus(command.getDevice().getId(), newStatus);
            return;
        }

        command.setErrorCode(result.errorCode());
        command.setErrorMessage(result.errorMessage());

        if (result.retryable() && retryPolicy.canRetry(command)) {
            command.setRetryCount(command.getRetryCount() + 1);
            command.setStatus(CommandStatus.RETRYING);
            command.setNextRetryAt(retryPolicy.nextRetryAt(command));
            log.info(
                    "Scheduling retry #{} for command {} at {}",
                    command.getRetryCount(),
                    command.getId(),
                    command.getNextRetryAt());
            return;
        }

        command.setStatus(CommandStatus.FAILED);
        command.setCompletedAt(now);
        command.setNextRetryAt(null);
    }
}
