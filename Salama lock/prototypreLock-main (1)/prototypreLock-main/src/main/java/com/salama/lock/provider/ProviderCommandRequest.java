package com.salama.lock.provider;

import com.salama.lock.domain.enums.CommandType;
import com.salama.lock.domain.enums.IdentifierType;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Versioned provider command payload.
 *
 * <p>Schema is independent of the {@code devices} table so Google (or future providers)
 * can require additional fields without API or schema redesign.
 *
 * <p>v1 fields: lockId, commandType, commandId, identifiers, metadata, providerHints.
 * Future versions may add required keys inside {@link #providerHints()} such as
 * {@code androidEnterpriseId}, {@code projectId}, {@code deviceResourceName}, {@code policyName}.
 */
public record ProviderCommandRequest(
        int schemaVersion,
        String lockId,
        CommandType commandType,
        String commandId,
        Map<String, String> identifiers,
        Map<String, Object> metadata,
        Map<String, Object> providerHints) {

    public static final int CURRENT_VERSION = 1;

    public ProviderCommandRequest {
        identifiers = identifiers == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(identifiers));
        metadata = metadata == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(metadata));
        providerHints =
                providerHints == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(providerHints));
    }

    public static Builder builder() {
        return new Builder();
    }

    /** Primary IMEI when present — convenience for providers that still key on IMEI. */
    public String primaryImei() {
        return identifiers.get(IdentifierType.IMEI.name());
    }

    public String identifier(IdentifierType type) {
        return identifiers.get(type.name());
    }

    public static final class Builder {
        private int schemaVersion = CURRENT_VERSION;
        private String lockId;
        private CommandType commandType;
        private String commandId;
        private Map<String, String> identifiers = new LinkedHashMap<>();
        private Map<String, Object> metadata = new LinkedHashMap<>();
        private Map<String, Object> providerHints = new LinkedHashMap<>();

        public Builder schemaVersion(int schemaVersion) {
            this.schemaVersion = schemaVersion;
            return this;
        }

        public Builder lockId(String lockId) {
            this.lockId = lockId;
            return this;
        }

        public Builder commandType(CommandType commandType) {
            this.commandType = commandType;
            return this;
        }

        public Builder commandId(String commandId) {
            this.commandId = commandId;
            return this;
        }

        public Builder identifiers(Map<String, String> identifiers) {
            this.identifiers = identifiers != null ? new LinkedHashMap<>(identifiers) : new LinkedHashMap<>();
            return this;
        }

        public Builder putIdentifier(IdentifierType type, String value) {
            if (value != null && !value.isBlank()) {
                this.identifiers.put(type.name(), value);
            }
            return this;
        }

        public Builder putIdentifier(String type, String value) {
            if (value != null && !value.isBlank()) {
                this.identifiers.put(type, value);
            }
            return this;
        }

        public Builder metadata(Map<String, Object> metadata) {
            this.metadata = metadata != null ? new LinkedHashMap<>(metadata) : new LinkedHashMap<>();
            return this;
        }

        public Builder providerHints(Map<String, Object> providerHints) {
            this.providerHints = providerHints != null ? new LinkedHashMap<>(providerHints) : new LinkedHashMap<>();
            return this;
        }

        public Builder putHint(String key, Object value) {
            if (value != null) {
                this.providerHints.put(key, value);
            }
            return this;
        }

        public ProviderCommandRequest build() {
            return new ProviderCommandRequest(
                    schemaVersion, lockId, commandType, commandId, identifiers, metadata, providerHints);
        }
    }
}
