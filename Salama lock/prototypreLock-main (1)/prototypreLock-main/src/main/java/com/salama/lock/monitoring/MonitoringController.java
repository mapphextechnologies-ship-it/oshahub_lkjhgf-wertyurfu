package com.salama.lock.monitoring;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/monitoring")
@RequiredArgsConstructor
public class MonitoringController {

    private final MonitoringService monitoringService;

    @GetMapping("/statistics")
    public Map<String, Object> statistics() {
        return monitoringService.statistics();
    }

    @GetMapping("/provider")
    public Map<String, Object> provider() {
        return monitoringService.providerStatus();
    }

    @GetMapping("/queue")
    public Map<String, Object> queue() {
        return monitoringService.queueStatus();
    }
}
