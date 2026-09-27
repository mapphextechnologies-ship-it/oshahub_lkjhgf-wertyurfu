package com.salama.lock.provider;

import com.salama.lock.common.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Real Google DLC client — implement after partnership agreement.
 * Kept as a stub so Phase 12 is a drop-in replacement.
 *
 * <p>When implementing, read from {@link ProviderCommandRequest}:
 * identifiers (IMEI, GOOGLE_DEVICE_ID, GOOGLE_LOCK_ID, …) and providerHints
 * (androidEnterpriseId, projectId, deviceResourceName, policyName, …).
 */
@Component
public class GoogleDlcProvider implements DeviceLockProvider {

    @Override
    public String name() {
        return "GOOGLE_DLC";
    }

    @Override
    public ProviderResult lock(ProviderCommandRequest request) {
        throw new BusinessException(
                HttpStatus.NOT_IMPLEMENTED,
                "GOOGLE_DLC_NOT_CONFIGURED",
                "Google DLC provider is not configured yet. Use MockGoogleProvider.");
    }

    @Override
    public ProviderResult unlock(ProviderCommandRequest request) {
        throw new BusinessException(
                HttpStatus.NOT_IMPLEMENTED,
                "GOOGLE_DLC_NOT_CONFIGURED",
                "Google DLC provider is not configured yet. Use MockGoogleProvider.");
    }
}
