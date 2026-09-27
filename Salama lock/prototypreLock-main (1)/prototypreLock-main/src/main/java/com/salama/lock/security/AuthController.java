package com.salama.lock.security;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final ApiKeyAuthenticationService apiKeyAuthenticationService;
    private final JwtService jwtService;

    @PostMapping(value = "/token", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> token(
            @RequestHeader(value = AuthenticationFilter.API_KEY_HEADER, required = false) String apiKeyHeader,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {

        String rawKey = apiKeyHeader;
        if ((rawKey == null || rawKey.isBlank()) && authorization != null && authorization.startsWith("ApiKey ")) {
            rawKey = authorization.substring("ApiKey ".length()).trim();
        }
        if (rawKey == null || rawKey.isBlank()) {
            return ResponseEntity.status(401).body(Map.of(
                    "status", 401,
                    "error", "UNAUTHORIZED",
                    "message", "API key required"));
        }

        PartnerPrincipal principal = apiKeyAuthenticationService.authenticate(rawKey.trim());
        String token = jwtService.issueToken(principal);

        return ResponseEntity.ok(Map.of(
                "accessToken", token,
                "tokenType", "Bearer",
                "expiresInSeconds", 3600,
                "companyCode", principal.getCompanyCode(),
                "scopes", principal.getScopes()));
    }
}
