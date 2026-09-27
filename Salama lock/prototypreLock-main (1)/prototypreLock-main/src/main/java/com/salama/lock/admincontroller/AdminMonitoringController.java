package com.salama.lock.admincontroller;

import com.salama.lock.admin.AdminMonitoringService;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/monitoring")
@RequiredArgsConstructor
public class AdminMonitoringController {

    private final AdminMonitoringService adminMonitoringService;

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@RequestParam(defaultValue = "40") int logLimit) {
        return adminMonitoringService.dashboard(logLimit);
    }

    @GetMapping("/logs")
    public List<Map<String, Object>> logs(@RequestParam(defaultValue = "50") int limit) {
        return adminMonitoringService.logs(limit);
    }
}
