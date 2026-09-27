package com.salama.lock.device;

import com.salama.lock.device.dto.DeviceResponse;
import com.salama.lock.device.dto.RegisterDeviceRequest;
import com.salama.lock.security.PartnerPrincipal;
import com.salama.lock.security.SecurityUtils;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService deviceService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('SCOPE_devices:write')")
    public DeviceResponse register(@Valid @RequestBody RegisterDeviceRequest request) {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        return deviceService.register(principal, request);
    }

    @GetMapping
    @PreAuthorize("hasAuthority('SCOPE_devices:read')")
    public List<DeviceResponse> list() {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        return deviceService.list(principal);
    }

    /** Explicit IMEI lookup (transitional). Prefer {@link #getByLockId}. */
    @GetMapping("/by-imei/{imei}")
    @PreAuthorize("hasAuthority('SCOPE_devices:read')")
    public DeviceResponse getByImei(@PathVariable String imei) {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        return deviceService.getByImei(principal, imei);
    }

    /** Lookup by permanent Salama {@code lockId}. */
    @GetMapping("/{lockId}")
    @PreAuthorize("hasAuthority('SCOPE_devices:read')")
    public DeviceResponse getByLockId(@PathVariable String lockId) {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        return deviceService.getByLockId(principal, lockId);
    }

    /** Soft-deactivate by permanent {@code lockId}. */
    @DeleteMapping("/{lockId}")
    @PreAuthorize("hasAuthority('SCOPE_devices:write')")
    public DeviceResponse deactivate(@PathVariable String lockId) {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        return deviceService.deactivate(principal, lockId);
    }
}
