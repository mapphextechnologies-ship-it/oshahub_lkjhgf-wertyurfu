package com.salama.lock.admin;

import com.salama.lock.admin.dto.CreateCompanyRequest;
import com.salama.lock.common.exception.BusinessException;
import com.salama.lock.domain.entity.ApiKey;
import com.salama.lock.domain.entity.Company;
import com.salama.lock.domain.enums.ApiKeyStatus;
import com.salama.lock.domain.enums.CompanyStatus;
import com.salama.lock.domain.repository.ApiKeyRepository;
import com.salama.lock.domain.repository.CompanyRepository;
import com.salama.lock.security.ApiKeyHasher;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CompanyBootstrapService {

    private final CompanyRepository companyRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyHasher apiKeyHasher;

    @Transactional
    public Map<String, Object> createCompanyWithApiKey(CreateCompanyRequest request) {
        if (companyRepository.existsByCode(request.getCode())) {
            throw new BusinessException(HttpStatus.CONFLICT, "COMPANY_EXISTS", "Company code already exists");
        }

        Company company = companyRepository.save(Company.builder()
                .name(request.getName())
                .code(request.getCode())
                .status(CompanyStatus.ACTIVE)
                .contactEmail(request.getContactEmail())
                .build());

        String rawKey = apiKeyHasher.generateRawKey();
        ApiKey apiKey = apiKeyRepository.save(ApiKey.builder()
                .company(company)
                .name(request.getApiKeyName() != null ? request.getApiKeyName() : "Default Key")
                .keyPrefix(apiKeyHasher.prefixOf(rawKey))
                .keyHash(apiKeyHasher.hash(rawKey))
                .status(ApiKeyStatus.ACTIVE)
                .scopes("devices:read,devices:write,commands:write,commands:read")
                .build());

        return Map.of(
                "companyId", company.getId().toString(),
                "companyCode", company.getCode(),
                "apiKeyId", apiKey.getId().toString(),
                "apiKey", rawKey,
                "warning", "Store the apiKey now — it will not be shown again");
    }
}
