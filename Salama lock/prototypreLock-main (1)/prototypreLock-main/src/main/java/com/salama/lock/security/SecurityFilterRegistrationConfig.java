package com.salama.lock.security;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Prevents security filters from also running as raw servlet filters
 * (which makes OncePerRequestFilter skip the SecurityFilterChain pass).
 */
@Configuration
public class SecurityFilterRegistrationConfig {

    @Bean
    FilterRegistrationBean<AuthenticationFilter> authenticationFilterRegistration(
            AuthenticationFilter filter) {
        FilterRegistrationBean<AuthenticationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    FilterRegistrationBean<AdminAuthenticationFilter> adminAuthenticationFilterRegistration(
            AdminAuthenticationFilter filter) {
        FilterRegistrationBean<AdminAuthenticationFilter> registration =
                new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
