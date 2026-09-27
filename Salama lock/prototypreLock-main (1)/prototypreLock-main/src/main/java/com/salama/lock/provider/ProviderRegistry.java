package com.salama.lock.provider;

import com.salama.lock.config.SystemConfigService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ProviderRegistry {

    private final List<DeviceLockProvider> providers;
    private final SystemConfigService systemConfigService;
    private final MockGoogleProvider mockGoogleProvider;

    public DeviceLockProvider activeProvider() {
        String active = systemConfigService.getValueOrDefault("provider.active", "MOCK_GOOGLE_DLC");

        return providers.stream()
                .filter(p -> p.name().equalsIgnoreCase(active))
                .findFirst()
                .orElse(mockGoogleProvider);
    }
}
