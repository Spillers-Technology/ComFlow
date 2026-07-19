# Security policy

## Report privately

Do not put vulnerabilities, credentials, real caller data, recordings, tenant
exports, or private infrastructure details in a public issue.

Email `support@spillerstech.us` with the subject `ComFlow security report`. Include
the affected version, impact, and reproduction steps using synthetic data. Share
the minimum sensitive detail needed to reproduce the problem; do not attach live
tokens or customer recordings.

## If a secret was exposed

Treat deletion from the latest commit as containment, not remediation:

1. Revoke or rotate the credential at its provider first.
2. Review access and billing logs for use of the old value.
3. Remove the material from the current tree.
4. Decide whether reachable Git history, release artifacts, container layers, and
   forks also require a coordinated purge.
5. Re-scan before publishing again.

Local `.env` files, SIP account files, SQLite databases and WAL/SHM companions,
private keys, package-manager auth files, recordings, and generated exports are
intentionally ignored. Use Kubernetes Secrets or another secret manager in hosted
deployments; never place confidential values in ConfigMaps or deployment literals.

## Supported versions

Security fixes target the newest published ComFlow release. Reproduce against the
latest release before reporting when practical.
