package com.salama.lock.admincontroller;

import com.salama.lock.admin.AdminCompaniesOverviewService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/companies-overview")
@RequiredArgsConstructor
public class AdminCompaniesOverviewController {

    private final AdminCompaniesOverviewService adminCompaniesOverviewService;

    @GetMapping
    public Map<String, Object> overview() {
        return adminCompaniesOverviewService.overview();
    }
}
