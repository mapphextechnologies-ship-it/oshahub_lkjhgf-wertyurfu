package com.salama.lock.queue;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CommandQueueWorker {

    private final CommandExecutorService commandExecutorService;

    @Scheduled(fixedDelayString = "${salama.queue.poll-interval-ms:2000}")
    public void poll() {
        List<UUID> ids = commandExecutorService.claimBatch();
        for (UUID id : ids) {
            try {
                commandExecutorService.processOne(id);
            } catch (Exception ex) {
                log.error("Failed processing command {}", id, ex);
            }
        }
    }
}
