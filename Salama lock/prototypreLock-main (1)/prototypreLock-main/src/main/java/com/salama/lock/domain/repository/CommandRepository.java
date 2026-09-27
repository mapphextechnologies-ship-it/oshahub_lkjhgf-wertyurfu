package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.Command;
import com.salama.lock.domain.enums.CommandStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommandRepository extends JpaRepository<Command, UUID> {

    Optional<Command> findByCompanyIdAndIdempotencyKey(UUID companyId, String idempotencyKey);

    Optional<Command> findByIdAndCompanyId(UUID id, UUID companyId);

    List<Command> findByDeviceIdOrderByCreatedAtDesc(UUID deviceId);

    List<Command> findByCompanyIdOrderByCreatedAtDesc(UUID companyId);

    long countByStatus(CommandStatus status);

    @Query(value = """
            SELECT c.id FROM commands c
            WHERE c.status IN ('PENDING', 'RETRYING')
              AND (c.next_retry_at IS NULL OR c.next_retry_at <= :now)
            ORDER BY c.queued_at ASC
            LIMIT :batchSize
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<UUID> claimCandidateIds(@Param("now") Instant now, @Param("batchSize") int batchSize);

    @Modifying
    @Query("""
            UPDATE Command c
            SET c.status = :processing,
                c.startedAt = :now,
                c.updatedAt = :now
            WHERE c.id IN :ids
              AND c.status IN (:pending, :retrying)
            """)
    int markProcessing(
            @Param("ids") List<UUID> ids,
            @Param("processing") CommandStatus processing,
            @Param("pending") CommandStatus pending,
            @Param("retrying") CommandStatus retrying,
            @Param("now") Instant now);
}
