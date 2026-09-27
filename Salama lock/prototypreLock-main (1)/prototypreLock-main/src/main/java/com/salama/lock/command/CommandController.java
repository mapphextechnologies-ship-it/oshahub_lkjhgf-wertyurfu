package com.salama.lock.command;

import com.salama.lock.command.dto.CommandResponse;
import com.salama.lock.command.dto.LockUnlockRequest;
import com.salama.lock.common.CorrelationIds;
import com.salama.lock.security.PartnerPrincipal;
import com.salama.lock.security.SecurityUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class CommandController {

    private final CommandService commandService;

    @PostMapping("/lock")
    @PreAuthorize("hasAuthority('SCOPE_commands:write')")
    public ResponseEntity<CommandResponse> lock(
            @Valid @RequestBody LockUnlockRequest request, HttpServletRequest httpRequest) {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        CommandResponse body =
                commandService.enqueueLock(principal, request, CorrelationIds.from(httpRequest));
        return accepted(body);
    }

    @PostMapping("/unlock")
    @PreAuthorize("hasAuthority('SCOPE_commands:write')")
    public ResponseEntity<CommandResponse> unlock(
            @Valid @RequestBody LockUnlockRequest request, HttpServletRequest httpRequest) {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        CommandResponse body =
                commandService.enqueueUnlock(principal, request, CorrelationIds.from(httpRequest));
        return accepted(body);
    }

    @GetMapping("/commands/{id}")
    @PreAuthorize("hasAuthority('SCOPE_commands:read')")
    public CommandResponse status(@PathVariable UUID id) {
        PartnerPrincipal principal = SecurityUtils.requirePrincipal();
        return commandService.getStatus(principal, id);
    }

    private static ResponseEntity<CommandResponse> accepted(CommandResponse body) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .location(URI.create(body.getLinks().get("self")))
                .body(body);
    }
}
