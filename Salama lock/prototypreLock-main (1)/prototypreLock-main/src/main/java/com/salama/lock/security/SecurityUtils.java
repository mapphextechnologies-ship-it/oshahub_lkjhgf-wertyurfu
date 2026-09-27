package com.salama.lock.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class SecurityUtils {

    private SecurityUtils() {}

    public static PartnerPrincipal requirePrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof PartnerPrincipal principal)) {
            throw new org.springframework.security.authentication.BadCredentialsException("Unauthenticated");
        }
        return principal;
    }
}
