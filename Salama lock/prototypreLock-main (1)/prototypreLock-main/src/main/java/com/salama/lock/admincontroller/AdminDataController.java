package com.salama.lock.admincontroller;

import com.salama.lock.admin.AdminDataService;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Local-only database browser for learning / debugging.
 * Restrict or remove before production.
 */
@RestController
@RequestMapping("/api/v1/admin/data")
@RequiredArgsConstructor
public class AdminDataController {

    private final AdminDataService adminDataService;

    @GetMapping("/overview")
    public Map<String, Object> overview() {
        return adminDataService.overview();
    }

    @GetMapping("/companies")
    public List<Map<String, Object>> companies() {
        return adminDataService.companies();
    }

    @GetMapping("/api-keys")
    public List<Map<String, Object>> apiKeys() {
        return adminDataService.apiKeys();
    }

    @GetMapping("/devices")
    public List<Map<String, Object>> devices() {
        return adminDataService.devices();
    }

    @GetMapping("/commands")
    public List<Map<String, Object>> commands(@RequestParam(defaultValue = "50") int limit) {
        return adminDataService.commands(limit);
    }

    @GetMapping("/audit-logs")
    public List<Map<String, Object>> auditLogs(@RequestParam(defaultValue = "50") int limit) {
        return adminDataService.auditLogs(limit);
    }

    @GetMapping("/google-callbacks")
    public List<Map<String, Object>> googleCallbacks() {
        return adminDataService.googleCallbacks();
    }

    @GetMapping("/provider-configs")
    public List<Map<String, Object>> providerConfigs() {
        return adminDataService.providerConfigs();
    }

    @GetMapping("/system-configs")
    public List<Map<String, Object>> systemConfigs() {
        return adminDataService.systemConfigs();
    }

    @PostMapping("/reset-business-data")
    public Map<String, Object> resetBusinessData() {
        return adminDataService.resetBusinessData();
    }
}
