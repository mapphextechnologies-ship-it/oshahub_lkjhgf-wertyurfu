package com.salama.lock.callback;

import com.salama.lock.callback.dto.GoogleCallbackRequest;
import com.salama.lock.common.exception.BusinessException;
import com.salama.lock.config.SalamaProperties;
import com.salama.lock.security.AdminAuthenticationFilter;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/callback")
@RequiredArgsConstructor
public class GoogleCallbackController {

    public static final String CALLBACK_SECRET_HEADER = "X-Callback-Secret";

    private final GoogleCallbackService googleCallbackService;
    private final SalamaProperties properties;

    @PostMapping("/google")
    @ResponseStatus(HttpStatus.OK)
    public Map<String, Object> receive(
            @Valid @RequestBody GoogleCallbackRequest request,
            @RequestHeader(value = CALLBACK_SECRET_HEADER, required = false) String callbackSecret) {

        verifyCallbackSecret(callbackSecret);
        return googleCallbackService.handle(request);
    }

    private void verifyCallbackSecret(String provided) {
        if (!properties.getSecurity().isCallbackSecretConfigured()) {
            return;
        }
        if (provided == null
                || provided.isBlank()
                || !AdminAuthenticationFilter.constantTimeEquals(
                        provided.trim(), properties.getSecurity().getCallbackSecret())) {
            throw new BusinessException(
                    HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid or missing callback secret");
        }
    }
}
