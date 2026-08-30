# Identity recovery decisions for hosted service

**Status:** Advance 6 audit recommendation; not product-owner approval  
**Scope:** Password recovery (#16) and replay-safe MFA (#17)

## Recommended merge and release boundaries

The identity branches may be reviewed as dormant, fail-closed capabilities, but
their merge does not authorize public registration. Hosted release remains
closed until the operational controls below exist and are rehearsed.

### Recovery email

- Keep the generic response floor so the public endpoint does not disclose an
  account through status or obvious response-time differences.
- Do not make SMTP success part of the synchronous response; that recreates an
  enumeration signal and couples request availability to the mail relay.
- Before invite beta, persist recovery deliveries in an outbox in the same
  transaction as the token reservation. Retry with a finite policy, record
  delivery state without storing the raw token in logs, and alert on terminal
  failure.

**Audit disposition:** acceptable merge boundary with registration closed;
durable outbox is a hosted-release gate.

### MFA encryption-key rotation

- Hosted deployments must set a stable `COMFLOW_MFA_ENCRYPTION_KEY` separately
  from the session signing secret. The fallback is for compatibility, not a
  rotation strategy.
- Before invite beta, store a non-secret key identifier with each encrypted
  seed, accept an explicit previous-key ring during rotation, and lazily rewrap
  a seed under the active key after successful factor verification.
- Backups must include the active/previous key material through the deployment's
  secret manager. A database restored without its key is not a successful
  restore.

**Audit disposition:** design is specified; implementation and restore proof are
hosted-release gates.

### Lost-factor recovery

- Recovery codes are the normal self-service path. Password reset alone must not
  silently disable MFA.
- Before invite beta, add an owner-only, tenant-scoped MFA reset action through
  the normal application/approval surface. It must require a fresh privileged
  factor, revoke the target's sessions, API keys, challenges, seed, and recovery
  codes atomically, notify the account address, and write an audit event naming
  the actor and target.
- Document a cooling-off/escalation procedure for an owner who loses every
  factor. Direct SQLite edits are not a supported recovery path.

**Audit disposition:** current recovery codes are sufficient for branch review;
operator-assisted recovery is a hosted-release gate.

## Review questions

1. Does the operator accept merging identity capability while public
   registration remains closed behind the hosted-release gates above?
2. Is an audited platform-owner reset acceptable for invite beta, or should
   lost-all-factor recovery remain manual and keep the customer outside beta?
3. What recovery-delivery retry window and support response target can one
   operator honestly sustain?
