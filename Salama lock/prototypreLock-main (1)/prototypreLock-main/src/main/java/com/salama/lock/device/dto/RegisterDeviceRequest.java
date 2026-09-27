package com.salama.lock.device.dto;

import com.salama.lock.domain.enums.DeviceType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import lombok.Getter;
import lombok.Setter;
import org.springframework.util.StringUtils;

@Getter
@Setter
public class RegisterDeviceRequest {

    /**
     * Legacy single-IMEI field. Prefer {@link #imei1}.
     */
    @Pattern(regexp = "^\\d{14,17}$", message = "IMEI must be 14-17 digits")
    private String imei;

    @Pattern(regexp = "^\\d{14,17}$", message = "IMEI1 must be 14-17 digits")
    private String imei1;

    @Pattern(regexp = "^\\d{14,17}$", message = "IMEI2 must be 14-17 digits")
    private String imei2;

    @Size(max = 128)
    private String serialNumber;

    @Size(max = 256)
    private String googleDeviceId;

    @Size(max = 256)
    private String googleLockId;

    private DeviceType deviceType;

    @Size(max = 128)
    private String manufacturer;

    @Size(max = 128)
    private String model;

    private Map<String, Object> metadata;

    /**
     * @deprecated Client-supplied lock IDs are ignored; Salama always generates a permanent lock_id.
     */
    @Deprecated
    @Size(max = 128)
    private String lockId;

    public String resolveImei1() {
        if (StringUtils.hasText(imei1)) {
            return imei1;
        }
        return imei;
    }

    @AssertTrue(message = "imei1 (or legacy imei) is required")
    public boolean isImei1Present() {
        return StringUtils.hasText(resolveImei1());
    }

    @AssertTrue(message = "imei1 and imei2 must be different")
    public boolean isImeisDistinct() {
        String primary = resolveImei1();
        if (!StringUtils.hasText(primary) || !StringUtils.hasText(imei2)) {
            return true;
        }
        return !primary.equals(imei2);
    }
}
