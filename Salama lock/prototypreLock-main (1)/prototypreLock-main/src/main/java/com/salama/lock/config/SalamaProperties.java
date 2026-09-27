package com.salama.lock.config;

import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@Getter
@Setter
@ConfigurationProperties(prefix = "salama")
public class SalamaProperties {

    private final Security security = new Security();
    private final Queue queue = new Queue();
    private final Retry retry = new Retry();
    private final Provider provider = new Provider();
    private final Identity identity = new Identity();

    @Getter
    @Setter
    public static class Security {
        private final Jwt jwt = new Jwt();
        /** Protects /api/v1/admin/**. Empty = open (dev only; forbidden in prod). */
        private String adminApiKey = "";
        /** Protects POST /api/v1/callback/google. Empty = open (dev only). */
        private String callbackSecret = "";
        private List<String> corsAllowedOrigins = new ArrayList<>(List.of("http://localhost:8080"));

        public boolean isAdminApiKeyConfigured() {
            return StringUtils.hasText(adminApiKey);
        }

        public boolean isCallbackSecretConfigured() {
            return StringUtils.hasText(callbackSecret);
        }

        @Getter
        @Setter
        public static class Jwt {
            private String secret;
            private long expirationMs = 3_600_000L;
        }
    }

    @Getter
    @Setter
    public static class Queue {
        private long pollIntervalMs = 2_000L;
        private int batchSize = 20;
    }

    @Getter
    @Setter
    public static class Retry {
        private List<Long> delaysSeconds = List.of(30L, 60L, 300L, 900L);
    }

    @Getter
    @Setter
    public static class Provider {
        private final Mock mock = new Mock();

        @Getter
        @Setter
        public static class Mock {
            private double failRate = 0.0;
            private double unavailableRate = 0.0;
            private long latencyMs = 50L;
        }
    }

    @Getter
    @Setter
    public static class Identity {
        /**
         * When true, lock/unlock may resolve devices by IMEI if lockId is omitted.
         * Prefer lockId for all new integrations.
         */
        private boolean allowImeiLock = true;
    }
}
