package com.salama.lock.admincontroller;

import com.salama.lock.admin.CompanyBootstrapService;
import com.salama.lock.admin.dto.CreateCompanyRequest;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Local bootstrap endpoints for creating partner companies and API keys.
 * Restrict or remove before production.
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminBootstrapController {

    private final CompanyBootstrapService companyBootstrapService;

    @PostMapping("/companies")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createCompany(@Valid @RequestBody CreateCompanyRequest request) {
        return companyBootstrapService.createCompanyWithApiKey(request);
    }
}
