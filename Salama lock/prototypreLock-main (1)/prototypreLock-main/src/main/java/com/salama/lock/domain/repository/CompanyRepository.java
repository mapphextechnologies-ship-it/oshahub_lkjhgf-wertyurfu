package com.salama.lock.domain.repository;

import com.salama.lock.domain.entity.Company;
import com.salama.lock.domain.enums.CompanyStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyRepository extends JpaRepository<Company, UUID> {

    Optional<Company> findByCode(String code);

    boolean existsByCode(String code);

    Optional<Company> findByIdAndStatus(UUID id, CompanyStatus status);
}
