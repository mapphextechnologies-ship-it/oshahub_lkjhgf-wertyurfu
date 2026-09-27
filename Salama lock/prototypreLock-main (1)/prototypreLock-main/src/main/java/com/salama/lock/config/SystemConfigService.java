package com.salama.lock.config;

import com.salama.lock.domain.repository.SystemConfigRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SystemConfigService {

    private final SystemConfigRepository systemConfigRepository;

    @Transactional(readOnly = true)
    public Optional<String> getValue(String key) {
        return systemConfigRepository.findByConfigKey(key).map(c -> c.getConfigValue());
    }

    @Transactional(readOnly = true)
    public String getValueOrDefault(String key, String defaultValue) {
        return getValue(key).orElse(defaultValue);
    }

    @Transactional(readOnly = true)
    public boolean getBooleanOrDefault(String key, boolean defaultValue) {
        return getValue(key).map(Boolean::parseBoolean).orElse(defaultValue);
    }
}
