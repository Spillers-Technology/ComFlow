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
- `accounts.example` — seed registration used only so the local edge can start.
  ComFlow admin settings generate the live `accounts` file at
  `/data/baresip/accounts` when `BARESIP_ACCOUNTS_PATH` points there.
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

## Admin-managed accounts

ComFlow can write baresip account registration from the Settings UI. The SIP
password is stored as a write-only secret override and is never returned by the
API. In the local Compose sample, both containers share `/data`, and baresip
reads `/data/baresip/accounts`.

baresip reads its account file at startup. ComFlow can call a restart supervisor
when `COMFLOW_BARESIP_RESTART_URL` or `BARESIP_RESTART_URL` is set; otherwise
the UI reports that restart is manual. For the sample Compose stack, run:

```
docker compose -f docker-compose.sip.sample.yml restart baresip
```
