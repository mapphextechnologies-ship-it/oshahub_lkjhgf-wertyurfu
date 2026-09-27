package com.salama.lock.command.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.salama.lock.domain.enums.CommandStatus;
import com.salama.lock.domain.enums.CommandType;
import com.salama.lock.domain.enums.ProviderType;
import java.time.Instant;
import java.util.Map;
import lombok.Builder;
import lombok.Getter;

/**
 * Partner-facing command view. External device identity is {@link #lockId} only —
 * no IMEI and no internal device UUID.
 */
@Getter
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CommandResponse {

    private final String commandId;
    private final String lockId;
    private final CommandType commandType;
    private final CommandStatus status;
    private final ProviderType provider;
    private final String externalRef;
    private final String idempotencyKey;
    private final String correlationId;
    private final Instant createdAt;

    /**
     * Hint for how long clients should wait before the next status poll.
     * Present only while the command is non-terminal.
     */
    private final Integer pollAfterSeconds;

    /** Present when useful for status polling (omitted when null). */
    private final Integer retryCount;
    private final String errorCode;
    private final String errorMessage;
    private final Instant completedAt;
    private final Instant nextRetryAt;

    /** Related resource URLs for REST clients. */
    private final Map<String, String> links;
}
