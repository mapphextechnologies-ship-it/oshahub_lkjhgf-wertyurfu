package com.salama.lock.retry;

import com.salama.lock.config.SalamaProperties;
import com.salama.lock.domain.entity.Command;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RetryPolicy {

    private final SalamaProperties properties;

    public boolean canRetry(Command command) {
        return command.getRetryCount() < command.getMaxRetries();
    }

    public Instant nextRetryAt(Command command) {
        List<Long> delays = properties.getRetry().getDelaysSeconds();
        int index = Math.min(command.getRetryCount(), delays.size() - 1);
        long delaySeconds = delays.get(Math.max(index, 0));
        return Instant.now().plusSeconds(delaySeconds);
    }
}
