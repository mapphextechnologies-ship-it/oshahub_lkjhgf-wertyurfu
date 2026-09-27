package com.salama.lock.security;

import com.salama.lock.config.SalamaProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private final SecretKey key;
    private final long expirationMs;

    public JwtService(SalamaProperties properties) {
        byte[] secret = properties.getSecurity().getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
        this.key = Keys.hmacShaKeyFor(secret);
        this.expirationMs = properties.getSecurity().getJwt().getExpirationMs();
    }

    public String issueToken(PartnerPrincipal principal) {
        Instant now = Instant.now();
        Instant exp = now.plusMillis(expirationMs);
        return Jwts.builder()
                .subject(principal.getCompanyId().toString())
                .claim("companyCode", principal.getCompanyCode())
                .claim("apiKeyId", principal.getApiKeyId().toString())
                .claim("scopes", String.join(",", principal.getScopes()))
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(key)
                .compact();
    }

    public PartnerPrincipal parseToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        return new PartnerPrincipal(
                UUID.fromString(claims.getSubject()),
                claims.get("companyCode", String.class),
                UUID.fromString(claims.get("apiKeyId", String.class)),
                claims.get("scopes", String.class));
    }
}
