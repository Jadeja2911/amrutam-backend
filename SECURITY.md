# Security Checklist & Threat Model

## 1. Data Classification

| Category | Examples | Sensitivity |
|---|---|---|
| Credentials | passwordHash, JWT secret | Critical — never logged, never in version control |
| PII | email, phone, full name, DOB | High — access-controlled, encrypted at rest via DB-level encryption |
| Health data | prescriptions, consultation notes | High — HIPAA-equivalent handling; only patient + assigned doctor may read |
| Financial | payment amount/status, gateway refs | High — no raw card data ever stored (out of scope; delegated to a PCI-compliant gateway) |
| Operational | audit logs, availability slots | Medium |
| Public | doctor specialization, consult fee (for search) | Low |

## 2. Attack Surface Analysis

| Entry point | Risk | Mitigation |
|---|---|---|
| `POST /api/auth/signup` / `login` | Credential stuffing, brute force | Rate limiting (planned), bcrypt with adequate cost factor, generic error messages (no "email not found" leak) |
| `POST /api/bookings` | Double-booking race, replay attacks | Row-level locking + idempotency key (implemented, tested) |
| JWT-protected routes | Token theft, forged tokens | Short-lived tokens (24h), signed with strong `JWT_SECRET`, verified server-side on every request |
| `/api/admin/*` | Privilege escalation | **Gap** — `requireRole('ADMIN')` not yet applied; tracked below |
| Direct DB access via Prisma raw queries | SQL injection | Only parameterized Prisma Client calls used; no raw string interpolation into SQL |
| Public search endpoint | Enumeration / scraping | Pagination limits; no PII exposed (only email of doctor's own account, specialization, fee) |

## 3. OWASP Top 10 Mapping

| OWASP Risk | Status | Notes |
|---|---|---|
| A01 Broken Access Control | Partial | RBAC middleware (`requireRole`) implemented and applied to booking/availability/consultation routes; **not yet applied to `/api/admin/summary`** — must be added before production |
| A02 Cryptographic Failures | Addressed | Passwords hashed with bcrypt; JWT signed with a secret loaded from environment, never hardcoded |
| A03 Injection | Addressed | Prisma ORM parameterizes all queries; the one raw query (`SELECT ... FOR UPDATE`) uses parameterized `$queryRaw` template literals, not string concatenation |
| A04 Insecure Design | Addressed | Idempotency + locking designed in from the start for the highest-risk flow (booking) |
| A05 Security Misconfiguration | Partial | `.env` is git-ignored; `helmet` middleware sets secure HTTP headers; CORS currently permissive (**TODO: restrict origins in production**) |
| A06 Vulnerable Components | Ongoing | Dependencies installed via pnpm with lockfile; recommend `pnpm audit` / Dependabot in CI (see CI section) |
| A07 Identification & Auth Failures | Partial | JWT auth implemented; MFA field exists on schema but MFA flow not yet implemented |
| A08 Software/Data Integrity | Addressed | CI intended to run from a locked dependency tree (`pnpm-lock.yaml` committed) |
| A09 Logging & Monitoring Failures | Partial | `AuditLog` table captures booking/consultation actions; centralized log aggregation (e.g., to a SIEM) not yet wired up |
| A10 SSRF | N/A | No user-controlled outbound URL fetching in current scope |

## 4. Encryption & Key Rotation

- **In transit**: all traffic must be served over TLS (terminated at the load
  balancer/reverse proxy in production; local dev uses plain HTTP).
- **At rest**: managed Postgres (Neon) encrypts data at rest by default.
- **Secrets**: `JWT_SECRET` and `DATABASE_URL` are supplied via environment
  variables / platform secret managers — never committed to git (`.env` is
  in `.gitignore`).
- **Key rotation policy (recommended)**: rotate `JWT_SECRET` on a scheduled
  basis (e.g., quarterly) or immediately on suspected compromise; because
  tokens are short-lived (24h), rotation invalidates all sessions within one
  day, an acceptable trade-off for this system's risk profile.

## 5. Audit Logging

Every booking-affecting action (`BOOKING_CREATED`, consultation completion,
cancellation, prescription creation) writes an `AuditLog` row within the same
database transaction as the business action, recording `userId`, `action`,
`entity`, `entityId`, and a JSON `metadata` blob. This gives a tamper-evident,
transactionally-consistent trail for compliance review.

## 6. Dependency Scanning

- `pnpm-lock.yaml` is committed, pinning exact dependency versions.
- **Recommended for CI**: add a `pnpm audit --audit-level=high` step (or
  GitHub's Dependabot) to fail builds on known-vulnerable packages before
  merge.

## 7. Input Validation & Rate Limiting

- All route handlers validate required fields and return `400` on missing/
  malformed input before touching the database.
- **Rate limiting is a known gap** — recommended addition: a token-bucket
  limiter (e.g., `express-rate-limit`) on `/api/auth/*` and `/api/bookings`
  to blunt brute-force and retry-storm scenarios.

## 8. Fail-Fast Checklist (Assignment Requirement)

> "Fail if critical security or idempotency is missing."

| Requirement | Status |
|---|---|
| Idempotency on write endpoints | ✅ Implemented (`idempotencyKey` on bookings) and tested end-to-end |
| Password hashing | ✅ bcrypt |
| RBAC on sensitive routes | ✅ Booking, availability, consultation routes; ❌ admin analytics (open item) |
| No secrets in source control | ✅ `.env` git-ignored |
| SQL injection protection | ✅ Parameterized queries only |

## 9. Open Items (Tracked for Follow-Up)

1. Apply `requireRole('ADMIN')` to `/api/admin/summary`.
2. Add rate limiting middleware to auth and booking routes.
3. Restrict CORS to known frontend origins in production config.
4. Implement MFA flow (schema field exists, flow does not).
5. Wire up dependency scanning in CI.
