package com.salama.lock.security;

import com.salama.lock.domain.entity.ApiKey;
import com.salama.lock.domain.enums.ApiKeyStatus;
import com.salama.lock.domain.enums.CompanyStatus;
import com.salama.lock.domain.repository.ApiKeyRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ApiKeyAuthenticationService {

    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyHasher apiKeyHasher;

    @Transactional
    public PartnerPrincipal authenticate(String rawApiKey) {
        String hash = apiKeyHasher.hash(rawApiKey);
        ApiKey apiKey = apiKeyRepository
                .findActiveWithCompany(hash, ApiKeyStatus.ACTIVE)
                .orElseThrow(() -> new BadCredentialsException("Invalid API key"));

        if (apiKey.getExpiresAt() != null && apiKey.getExpiresAt().isBefore(Instant.now())) {
            apiKey.setStatus(ApiKeyStatus.EXPIRED);
            throw new BadCredentialsException("API key expired");
        }

        if (apiKey.getCompany().getStatus() != CompanyStatus.ACTIVE) {
            throw new BadCredentialsException("Company is not active");
        }

        apiKey.setLastUsedAt(Instant.now());

        return new PartnerPrincipal(
                apiKey.getCompany().getId(),
                apiKey.getCompany().getCode(),
                apiKey.getId(),
                apiKey.getScopes());
    }
}
