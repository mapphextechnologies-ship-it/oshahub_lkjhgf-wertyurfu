package com.salama.lock.callback.dto;

import com.salama.lock.domain.enums.CallbackEvent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class GoogleCallbackRequest {

    @NotBlank
    private String lockId;

    private String imei;

    private String commandId;

    @NotNull
    private CallbackEvent eventType;

    private String providerEventId;

    private Map<String, Object> payload;
}
