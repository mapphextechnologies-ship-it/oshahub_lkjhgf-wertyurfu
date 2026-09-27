# Salama Lock

Device lock middleware for finance / retail partners. Partners call REST APIs to register devices and request lock/unlock; the middleware queues commands and talks to Google DLC (mocked until partnership).

## Architecture

```
Internet
   │
(HTTPS / HTTP)
   │
 Nginx          (production)
   │
Spring Boot     :8080
   │
 PostgreSQL
   │
  Redis         (connection ready; queue remains DB-backed)
```

| Phase | Module | Status |
|------:|--------|--------|
| 1 | Database design (Flyway) | Done |
| 2 | JPA entities + repositories | Done |
| 3 | Security (API keys, JWT, filter) | Done |
| 4 | Device module | Done |
| 5 | Command module | Done |
| 6 | Provider (`MockGoogleProvider`) | Done |
| 7 | Queue worker | Done |
| 8 | Retry backoff 30s / 1m / 5m / 15m | Done |
| 9 | Google callback | Done |
| 10 | Monitoring | Done |
| 11 | Audit trail | Done |
| 12 | Real `GoogleDlcProvider` | Stub only |

```
Partner finance system
        │  X-Api-Key / Bearer JWT
        ▼
  Salama Lock API
        │
        ├─ devices  → devices table
        ├─ lock/unlock → commands (PENDING)
        │                     │
        │                     ▼
        │              queue worker
        │                     │
        │                     ▼
        │           MockGoogleProvider  ──(later)──► GoogleDlcProvider
        │
        └─ callback/google ← provider async events
```

## Environment setup

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET, SALAMA_ADMIN_API_KEY, SALAMA_CALLBACK_SECRET for anything beyond local defaults
```

Key variables: `SPRING_PROFILES_ACTIVE`, `DB_*`, `REDIS_*`, `JWT_SECRET`, `SALAMA_ADMIN_API_KEY`, `SALAMA_CALLBACK_SECRET`, `ALLOW_IMEI_LOCK`, `PROVIDER_ACTIVE`.

## Development (Docker)

Builds the app image and starts Postgres, Redis, and Spring Boot:

```bash
docker compose up --build
```

App: `http://localhost:8080`  
Health: `http://localhost:8080/actuator/health`  
Postgres: `localhost:5432` / `salama` / `salama` / db `salama_lock`  
Redis: `localhost:6379`

### Hybrid (DB + Redis in Docker, app on host)

```bash
docker compose up -d postgres redis
mvn spring-boot:run
```

## Production

Requires a filled `.env` (no secret defaults). Starts app, Postgres, Redis, and Nginx (no source mounts):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Public entry: `http://localhost` (Nginx → app:8080). SSL is prepared in `nginx/nginx.conf` (commented placeholder).

## Common operations

```bash
# Stop
docker compose down
docker compose -f docker-compose.prod.yml down

# Logs
docker compose logs -f app
docker compose -f docker-compose.prod.yml logs -f app nginx

# Rebuild app only
docker compose up -d --build app
docker compose -f docker-compose.prod.yml up -d --build app

# Skip tests during image build
BUILD_SKIP_TESTS=true docker compose up --build
```

## Quick API smoke

### Create a partner + API key

```bash
curl -s -X POST http://localhost:8080/api/v1/admin/companies \
  -H 'Content-Type: application/json' \
  -H "X-Admin-Key: $SALAMA_ADMIN_API_KEY" \
  -d '{"name":"Acme Finance","code":"ACME","contactEmail":"ops@acme.test"}'
```

Save the returned `apiKey` (shown once).

### Auth

```bash
# Option A — send API key on every request
curl -H "X-Api-Key: $API_KEY" ...

# Option B — exchange for JWT
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/token \
  -H "X-Api-Key: $API_KEY" | jq -r .accessToken)
curl -H "Authorization: Bearer $TOKEN" ...
```

`POST /api/v1/lock` without credentials returns **401**.

### Device + lock flow

```bash
# Register (Salama returns permanent ULID lockId, e.g. SL-01K5A8FYD4QQ8E4T2G5S6H1C8P)
curl -s -X POST http://localhost:8080/api/v1/devices \
  -H "X-Api-Key: $API_KEY" -H 'Content-Type: application/json' \
  -d '{"imei1":"359759002014300","imei2":"359759002014318","manufacturer":"Samsung","model":"A54","metadata":{"loanId":"LOAN-22"}}'

# Lock by lockId (queued → worker → MockGoogleProvider)
curl -s -X POST http://localhost:8080/api/v1/lock \
  -H "X-Api-Key: $API_KEY" -H 'Content-Type: application/json' \
  -d '{"lockId":"SL-01K5A8FYD4QQ8E4T2G5S6H1C8P","idempotencyKey":"fin-inv-1001","externalRef":"INV-1001"}'

# Status
curl -s http://localhost:8080/api/v1/commands/{id} -H "X-Api-Key: $API_KEY"
```

IMEI lock/unlock remains available while `salama.identity.allow-imei-lock=true` (default).

## Database (Phase 1 + identity model)

| Table | Purpose |
|-------|---------|
| `companies` | Partner finance / retailer orgs |
| `api_keys` | Hashed API keys + scopes |
| `devices` | Internal UUID + permanent `lock_id` + status |
| `device_identifiers` | IMEI1/IMEI2, serial, Google Device ID, etc. |
| `commands` | Lock/unlock queue + ledger |
| `provider_configs` | Per-company / global provider settings |
| `audit_logs` | Every request, worker run, callback |
| `google_callbacks` | Inbound provider notifications |
| `system_configs` | Runtime knobs (active provider, retries) |

Enums (Java + DB CHECK): `CommandStatus`, `CommandType`, `ProviderType`, `DeviceStatus`, `DeviceType`, `CallbackEvent`, `ActorType`, `ApiKeyStatus`, `CompanyStatus`.

Cascade highlights:
- Delete company → cascade `api_keys`, `provider_configs`
- Delete company → **restrict** if devices/commands exist
- Delete command/device → callback FKs set null

## Phase 12 — swap to real Google DLC

1. Implement HTTP client inside `GoogleDlcProvider`
2. Set `system_configs.provider.active = GOOGLE_DLC` (and `PROVIDER_ACTIVE=GOOGLE_DLC` in `.env` for ops alignment)
3. Store credentials in `provider_configs.credentials_encrypted`

Nothing else in the command/queue path needs to change. Default remains `MockGoogleProvider` (`MOCK_GOOGLE_DLC`).
