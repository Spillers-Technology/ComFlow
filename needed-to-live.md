# Production readiness

This document intentionally excludes credentials, credential identifiers,
internal addresses, customer data, and private infrastructure topology. Keep
those details in the approved password manager, secret store, and private
infrastructure repository—not in this repository or a pull request.

PR #11 is not ready for a production release until every blocking item below is
closed with evidence. Passing unit tests alone is not sufficient for billing,
authentication, or telephony changes.

## Security containment

- Revoke and replace every credential that has been stored in a plaintext local
  file or shared outside the approved secret store, even if Git never tracked
  the file.
- Confirm the replacement credentials have only the minimum provider scopes
  required by ComFlow.
- Store runtime values only through the encrypted deployment-secret workflow.
- Run a history-aware secret scan and record the redacted result before merge.
- Do not record key prefixes, suffixes, internal IP addresses, account IDs, or
  live-secret status in public documentation.

Credential rotation is an external operator action. A code merge does not
complete it.

## Release blockers

- Require an active, granting subscription before a tenant can provision a DID.
- Prevent a tenant from starting a second Checkout subscription flow while an
  active or pending subscription already exists.
- Exercise real Stripe test-mode subscription lifecycle flows: create, renew,
  upgrade, downgrade, payment failure, cancellation, and webhook replay.
- Exercise the real SIP edge end to end for inbound and outbound calls. A fake
  telephony adapter is not production evidence.
- Prove outbound call duration and concurrency limits at the enforcement point.
- Perform and document an application-consistent backup and restore drill.
- Verify registration, email verification, password reset, TOTP enrollment,
  session revocation, and recovery paths against the deployable build.
- Close or explicitly accept every remaining high-severity dependency or
  security finding.

## Safe rollout order

1. Complete provider setup in test mode and populate encrypted deployment
   secrets through the private infrastructure workflow.
2. Build and publish both application and SIP-edge images from the reviewed
   commit.
3. Verify image provenance and digests before changing deployment manifests.
4. Deploy to a non-production environment and execute the blocker checklist.
5. Enable registration and billing only after the application refuses unsafe
   or incomplete hosted configuration at startup.
6. Roll out production manifests only after both images and rollback artifacts
   are available.
7. Confirm health, webhook delivery, a real inbound call, a real outbound call,
   subscription enforcement, and backup recovery before accepting customers.

Secret-only deployment changes may require an explicit workload restart; verify
the running workload received the intended secret version without printing the
secret value.

## Stop conditions

Stop or roll back the release if any of the following is true:

- a tenant can obtain paid service without the required subscription;
- webhook authenticity or idempotency cannot be demonstrated;
- the deployed telephony path still uses the fake adapter;
- call limits are configured but not enforced;
- a backup has not been restored successfully;
- any credential named in an exposure report has not been revoked; or
- deployment depends on an image that has not been published and verified.

Rollback instructions and infrastructure-specific values belong in the private
operations runbook. Preserve customer data during rollback and validate that
the previous application version remains compatible with the current schema.
