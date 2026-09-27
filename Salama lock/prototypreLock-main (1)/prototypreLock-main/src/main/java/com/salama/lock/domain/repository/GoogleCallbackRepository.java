package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.GoogleCallback;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoogleCallbackRepository extends JpaRepository<GoogleCallback, UUID> {

    Optional<GoogleCallback> findByProviderEventId(String providerEventId);

    List<GoogleCallback> findByProcessedFalseOrderByCreatedAtAsc();

    long countByProcessedFalse();
}
