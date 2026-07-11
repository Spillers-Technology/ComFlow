# Contributing to ComFlow

ComFlow stays deliberately focused: receive a voicemail, structure it, let a
human review it, and move the useful result into the team's workflow. Bug
reports, provider adapters, documentation improvements, and focused pull
requests are welcome.

## Before you build

- Search existing issues before opening a new one.
- Small fixes may go directly to a pull request. Please open an issue before a
  large feature or a change to SIP, tenant isolation, auth, metering, or billing.
- Keep conversational-agent features out of scope; ComFlow is a voicemail
  regulator, not an AI receptionist.
- Use synthetic recordings and identities only. Never commit real caller audio,
  transcripts, phone numbers, provider keys, or customer data.

## Local checks

```bash
npm install
npm run lint
npm run build
docker compose up --build
```

The default fake telephony and AI providers make it possible to exercise the
review flow without external accounts. Describe any real provider testing in
the pull request without exposing credentials or caller data.

## A useful pull request

Explain the operator problem, keep the diff focused, list the checks you ran,
and include screenshots for UI changes. Update the README or configuration docs
when behavior or environment variables change.
