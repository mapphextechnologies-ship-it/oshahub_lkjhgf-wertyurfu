package com.salama.lock.config;

/**
 * Layered architecture for Salama Lock (production-oriented):
 *
 * <pre>
 * Controller  →  HTTP only (validate input, call service, return response)
 *      ↓
 * Service     →  business logic, transactions, orchestration
 *      ↓
 * Provider    →  external systems (MockGoogle / Google DLC) when needed
 *      ↓
 * Repository  →  persistence access
 *      ↓
 * Database
 * </pre>
 *
 * Controllers must not inject repositories or write to the database directly.
 */
public final class ArchitectureRules {

    private ArchitectureRules() {}
}
