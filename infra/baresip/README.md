# baresip — ComFlow SIP edge

ComFlow does **not** implement SIP/RTP. A normal SIP user-agent
([baresip](https://github.com/baresip/baresip), BSD-3-Clause) registers to your
SIP source (a PBX or SIP-provider account), answers inbound calls, records the
voicemail, and is driven by the ComFlow backend over baresip's `ctrl_tcp`
control interface.

```
SIP source ──SIP/RTP──▶ baresip ──ctrl_tcp(JSON)──▶ ComFlow backend
                          │ records WAV
                          ▼ shared /data volume ─▶ backend ingests + transcribes
```

## Files

- `config` — baresip configuration. Loads the `ctrl_tcp`, `sndfile` (auto-record),
  `aufile` (greeting/message playback) and `httpd`-free modules; binds `ctrl_tcp`
  on `0.0.0.0:4444`; records calls into `/data/recordings-raw`.
- `accounts` — your SIP registration. **Holds credentials — never commit real
  secrets.** Copy `accounts.example` to `accounts` and fill it in (or template it
  from a secret at deploy time).
- `Dockerfile` — builds a pinned baresip + libre from source.

## Networking (the real telephony concern)

SIP/RTP need reachable UDP. In Docker/k8s either run the baresip container with
host networking, or publish `5060/udp` plus the RTP media port range
(`rtp_ports` in `config`, default `16384-16584`). Behind NAT, set the public
address via baresip's `net_interface` / STUN or your SIP provider's guidance.
This is baresip configuration — not ComFlow code.

## Control commands ComFlow uses

`accept`, `hangup`, `dial`, and `ausrc` (best-effort greeting/message playback).
If your baresip build names these differently, adjust the `CMD` map in
`packages/backend/src/services/telephonyGatewayService.ts`.
