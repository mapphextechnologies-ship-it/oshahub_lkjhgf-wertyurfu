package com.salama.lock.command.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import org.springframework.util.StringUtils;

@Getter
@Setter
public class LockUnlockRequest {

    /**
     * Preferred device identity for lock/unlock. Required for new integrations.
     */
    @Size(max = 128)
    private String lockId;

    /**
     * Transitional fallback when {@code salama.identity.allow-imei-lock=true}.
     */
    @Pattern(regexp = "^\\d{14,17}$", message = "IMEI must be 14-17 digits")
    private String imei;

    @Size(max = 128)
    private String idempotencyKey;

    @Size(max = 128)
    private String externalRef;

    @AssertTrue(message = "lockId or imei is required")
    public boolean isLockIdOrImeiPresent() {
        return StringUtils.hasText(lockId) || StringUtils.hasText(imei);
    }
}
