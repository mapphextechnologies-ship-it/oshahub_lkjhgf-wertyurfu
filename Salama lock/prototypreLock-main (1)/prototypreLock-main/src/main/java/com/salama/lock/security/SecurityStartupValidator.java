package com.salama.lock.security;

import com.salama.lock.config.SalamaProperties;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
@RequiredArgsConstructor
public class SecurityStartupValidator {

    private final SalamaProperties properties;
    private final Environment environment;

    @PostConstruct
    void validate() {
        boolean prod = isProd();

        if (!properties.getSecurity().isAdminApiKeyConfigured()) {
            if (prod) {
                throw new IllegalStateException(
                        "Production requires salama.security.admin-api-key (env SALAMA_ADMIN_API_KEY)");
            }
            log.warn("Admin API key is NOT set — /api/v1/admin/** is open. Set SALAMA_ADMIN_API_KEY before production.");
        } else {
            log.info("Admin API protected with X-Admin-Key");
        }

        if (!properties.getSecurity().isCallbackSecretConfigured()) {
            if (prod) {
                throw new IllegalStateException(
                        "Production requires salama.security.callback-secret (env SALAMA_CALLBACK_SECRET)");
            }
            log.warn("Callback secret is NOT set — POST /api/v1/callback/google is open. Set SALAMA_CALLBACK_SECRET.");
        } else {
            log.info("Google callback protected with X-Callback-Secret");
        }

        String jwtSecret = properties.getSecurity().getJwt().getSecret();
        if (!StringUtils.hasText(jwtSecret) || jwtSecret.contains("change-me")) {
            if (prod) {
                throw new IllegalStateException(
                        "Production requires a strong JWT_SECRET (not the default change-me value)");
            }
            log.warn("Using a weak/default JWT secret — set JWT_SECRET for production.");
        }
    }

    private boolean isProd() {
        for (String profile : environment.getActiveProfiles()) {
            if ("prod".equalsIgnoreCase(profile) || "production".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }
}
