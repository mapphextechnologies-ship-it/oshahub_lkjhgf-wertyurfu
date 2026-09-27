package com.salama.lock.provider;

import com.salama.lock.config.SalamaProperties;
import com.salama.lock.domain.enums.CommandType;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Stand-in for Google DLC until partnership credentials are available.
 * Swap this bean for {@link GoogleDlcProvider} in Phase 12.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MockGoogleProvider implements DeviceLockProvider {

    private final SalamaProperties properties;

    @Override
    public String name() {
        return "MOCK_GOOGLE_DLC";
    }

    @Override
    public ProviderResult lock(ProviderCommandRequest request) {
        return simulate(request, CommandType.LOCK);
    }

    @Override
    public ProviderResult unlock(ProviderCommandRequest request) {
        return simulate(request, CommandType.UNLOCK);
    }

    private ProviderResult simulate(ProviderCommandRequest request, CommandType type) {
        sleep();

        double roll = ThreadLocalRandom.current().nextDouble();
        var mock = properties.getProvider().getMock();

        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("provider", name());
        raw.put("schemaVersion", request.schemaVersion());
        raw.put("lockId", request.lockId());
        raw.put("imei", request.primaryImei());
        raw.put("identifiers", request.identifiers());
        raw.put("action", type.name());
        raw.put("commandId", request.commandId());

        if (roll < mock.getUnavailableRate()) {
            raw.put("status", "UNAVAILABLE");
            log.warn("Mock Google DLC unavailable for command {}", request.commandId());
            return ProviderResult.failed(true, "PROVIDER_UNAVAILABLE", "Google DLC temporarily unavailable", raw);
        }

        if (roll < mock.getUnavailableRate() + mock.getFailRate()) {
            raw.put("status", "FAILED");
            return ProviderResult.failed(false, "PROVIDER_REJECTED", "Mock provider rejected command", raw);
        }

        String providerRequestId = "mock-" + UUID.randomUUID();
        raw.put("status", type == CommandType.LOCK ? "LOCKED" : "UNLOCKED");
        raw.put("providerRequestId", providerRequestId);
        log.info("Mock Google DLC {} succeeded for lockId={}", type, request.lockId());
        return ProviderResult.ok(providerRequestId, raw);
    }

    private void sleep() {
        long latency = properties.getProvider().getMock().getLatencyMs();
        if (latency <= 0) {
            return;
        }
        try {
            Thread.sleep(latency);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
