package com.salama.lock.provider;

import com.salama.lock.domain.enums.CommandType;

public interface DeviceLockProvider {

    String name();

    ProviderResult lock(ProviderCommandRequest request);

    ProviderResult unlock(ProviderCommandRequest request);

    default ProviderResult execute(ProviderCommandRequest request) {
        return request.commandType() == CommandType.LOCK ? lock(request) : unlock(request);
    }

    record ProviderResult(
            boolean success,
            boolean retryable,
            String providerRequestId,
            String errorCode,
            String errorMessage,
            java.util.Map<String, Object> rawResponse) {

        public static ProviderResult ok(String providerRequestId, java.util.Map<String, Object> raw) {
            return new ProviderResult(true, false, providerRequestId, null, null, raw);
        }

        public static ProviderResult failed(
                boolean retryable, String code, String message, java.util.Map<String, Object> raw) {
            return new ProviderResult(false, retryable, null, code, message, raw);
        }
    }
}
