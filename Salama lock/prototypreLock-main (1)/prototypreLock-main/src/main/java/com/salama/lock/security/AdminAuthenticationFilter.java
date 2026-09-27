package com.salama.lock.security;

import com.salama.lock.config.SalamaProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates operators for /api/v1/admin/** via X-Admin-Key.
 * When no admin key is configured (local/dev), requests are allowed with a warning path.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
@RequiredArgsConstructor
public class AdminAuthenticationFilter extends OncePerRequestFilter {

    public static final String ADMIN_KEY_HEADER = "X-Admin-Key";

    private final SalamaProperties properties;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith("/api/v1/admin");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!properties.getSecurity().isAdminApiKeyConfigured()) {
            // Dev fallback — open admin API when key unset
            AdminPrincipal principal = new AdminPrincipal();
            SecurityContextHolder.getContext()
                    .setAuthentication(new UsernamePasswordAuthenticationToken(
                            principal, null, principal.getAuthorities()));
            filterChain.doFilter(request, response);
            return;
        }

        String provided = request.getHeader(ADMIN_KEY_HEADER);
        if (provided == null || provided.isBlank()) {
            unauthorized(response, "Admin API key required (X-Admin-Key)");
            return;
        }

        if (!constantTimeEquals(provided.trim(), properties.getSecurity().getAdminApiKey())) {
            unauthorized(response, "Invalid admin API key");
            return;
        }

        AdminPrincipal principal = new AdminPrincipal();
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(
                        principal, null, principal.getAuthorities()));
        filterChain.doFilter(request, response);
    }

    private void unauthorized(HttpServletResponse response, String message) throws IOException {
        SecurityContextHolder.clearContext();
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter()
                .write("{\"status\":401,\"error\":\"UNAUTHORIZED\",\"message\":\"" + message + "\"}");
    }

    public static boolean constantTimeEquals(String a, String b) {
        byte[] left = a.getBytes(StandardCharsets.UTF_8);
        byte[] right = b.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(left, right);
    }
}
