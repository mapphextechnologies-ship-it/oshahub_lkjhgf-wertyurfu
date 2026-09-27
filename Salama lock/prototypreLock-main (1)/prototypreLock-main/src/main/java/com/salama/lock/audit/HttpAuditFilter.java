package com.salama.lock.audit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salama.lock.common.CorrelationIds;
import com.salama.lock.domain.enums.ActorType;
import com.salama.lock.security.PartnerPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

@Component
@Order(Ordered.LOWEST_PRECEDENCE - 10)
@RequiredArgsConstructor
public class HttpAuditFilter extends OncePerRequestFilter {

    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator")
                || path.equals("/")
                || path.equals("/index.html")
                || path.equals("/guide")
                || path.equals("/guide/")
                || path.equals("/guide.html")
                || path.startsWith("/admin");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        ContentCachingRequestWrapper req = new ContentCachingRequestWrapper(request);
        ContentCachingResponseWrapper res = new ContentCachingResponseWrapper(response);
        long start = System.currentTimeMillis();
        String correlationId = request.getHeader(CorrelationIds.HEADER);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString();
        }
        req.setAttribute(CorrelationIds.REQUEST_ATTR, correlationId);
        res.setHeader(CorrelationIds.HEADER, correlationId);

        try {
            filterChain.doFilter(req, res);
        } finally {
            int duration = (int) (System.currentTimeMillis() - start);
            PartnerPrincipal principal = currentPrincipal();
            auditService.record(
                    principal != null ? principal.getCompanyId() : null,
                    principal != null ? ActorType.API_KEY : ActorType.SYSTEM,
                    principal != null ? principal.getApiKeyId().toString() : null,
                    req.getMethod() + " " + req.getRequestURI(),
                    null,
                    null,
                    req.getMethod(),
                    req.getRequestURI(),
                    parseBody(req.getContentAsByteArray()),
                    parseBody(res.getContentAsByteArray()),
                    res.getStatus(),
                    req.getRemoteAddr(),
                    req.getHeader("User-Agent"),
                    duration,
                    correlationId);
            res.copyBodyToResponse();
        }
    }

    private PartnerPrincipal currentPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof PartnerPrincipal principal) {
            return principal;
        }
        return null;
    }

    private Map<String, Object> parseBody(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            return null;
        }
        try {
            return objectMapper.readValue(bytes, new TypeReference<>() {});
        } catch (Exception ex) {
            return Map.of("raw", new String(bytes, StandardCharsets.UTF_8));
        }
    }
}
