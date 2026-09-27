package com.salama.lock.monitoring;

import com.salama.lock.config.SystemConfigService;
import com.salama.lock.domain.enums.CommandStatus;
import com.salama.lock.domain.repository.CommandRepository;
import com.salama.lock.domain.repository.DeviceRepository;
import com.salama.lock.domain.repository.GoogleCallbackRepository;
import com.salama.lock.provider.ProviderRegistry;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MonitoringService {

    private final CommandRepository commandRepository;
    private final DeviceRepository deviceRepository;
    private final GoogleCallbackRepository googleCallbackRepository;
    private final SystemConfigService systemConfigService;
    private final ProviderRegistry providerRegistry;

    public Map<String, Object> statistics() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("devicesTotal", deviceRepository.count());
        Map<String, Long> commands = new LinkedHashMap<>();
        for (CommandStatus status : CommandStatus.values()) {
            commands.put(status.name(), commandRepository.countByStatus(status));
        }
        stats.put("commandsByStatus", commands);
        stats.put("pendingCallbacks", googleCallbackRepository.countByProcessedFalse());
        return stats;
    }

    public Map<String, Object> providerStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("activeProvider", providerRegistry.activeProvider().name());
        status.put("configuredProvider", systemConfigService.getValueOrDefault("provider.active", "MOCK_GOOGLE_DLC"));
        return status;
    }

    public Map<String, Object> queueStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("pending", commandRepository.countByStatus(CommandStatus.PENDING));
        status.put("retrying", commandRepository.countByStatus(CommandStatus.RETRYING));
        status.put("processing", commandRepository.countByStatus(CommandStatus.PROCESSING));
        status.put("enabled", systemConfigService.getBooleanOrDefault("queue.enabled", true));
        return status;
    }
}
