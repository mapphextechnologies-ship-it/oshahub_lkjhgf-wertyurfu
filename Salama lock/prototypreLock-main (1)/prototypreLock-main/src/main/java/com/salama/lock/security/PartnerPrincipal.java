package com.salama.lock.security;

import java.util.Arrays;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

@Getter
public class PartnerPrincipal implements UserDetails {

    private final UUID companyId;
    private final String companyCode;
    private final UUID apiKeyId;
    private final Set<String> scopes;

    public PartnerPrincipal(UUID companyId, String companyCode, UUID apiKeyId, String scopesCsv) {
        this.companyId = companyId;
        this.companyCode = companyCode;
        this.apiKeyId = apiKeyId;
        this.scopes = Arrays.stream(scopesCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean hasScope(String scope) {
        return scopes.contains(scope);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return scopes.stream()
                .map(scope -> new SimpleGrantedAuthority("SCOPE_" + scope))
                .collect(Collectors.toSet());
    }

    @Override
    public String getPassword() {
        return "";
    }

    @Override
    public String getUsername() {
        return companyCode;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
