#!/usr/bin/env bash
set -euo pipefail

STACK=asterisk          # docker-compose project name
CONF_DIR=./asterisk     # where you keep your *.conf on the host

echo ">> Stopping and removing existing containers/volumes"
docker compose -p "$STACK" down --volumes

echo ">> Purging old bind-mounted conf files"
rm -rf "$CONF_DIR"
mkdir -p "$CONF_DIR"

echo ">> Dropping fresh configs"
cat > "$CONF_DIR/asterisk.conf" <<'EOF'
[options]
runuser    = asterisk
rungroup   = asterisk
verbose    = 3
autoload   = yes
systemname = docker-pbx

[directories]
astetcdir  = /etc/asterisk
; everything else uses built-in defaults
EOF

cat > "$CONF_DIR/pjsip_wizard.conf" <<'EOF'
; ---------- templates ----------
[_nat](!)
endpoint/rewrite_contact           = yes
endpoint/rtp_symmetric             = yes
endpoint/direct_media              = no
endpoint/bind_rtp_to_media_address = yes

[_qos](!)
endpoint/tos_audio = ef
endpoint/tos_video = af41

; ---------- Callcentric ----------
[callcentric](!,template=_nat,_qos)
type                    = wizard
sends_registrations     = yes
remote_hosts            = sip.callcentric.net
outbound_auth/username  = 1777XXXXXXX      ; <-- edit
outbound_auth/password  = SUPERSECRET      ; <-- edit
endpoint/from_user      = 1777XXXXXXX      ; <-- edit
endpoint/from_domain    = sip.callcentric.net
endpoint/allow          = !all,ulaw
identify/endpoint       = callcentric
identify/match          = 199.87.144.0/21
identify/match          = 204.11.192.0/22
;transport/udp/external_signaling_address = YOUR.WAN.IP
;transport/udp/external_media_address     = YOUR.WAN.IP

; ---------- local phone ----------
[1000](!,template=_nat,_qos)
type                = wizard
accepts_registrations = yes
inbound_auth/username = 1000
inbound_auth/password = EXT1000_PASSWORD   ; <-- edit
endpoint/context      = from-internal
endpoint/allow        = !all,ulaw
EOF

echo ">> Pulling new image and starting stack"
docker compose -p "$STACK" up -d --remove-orphans
echo "Done."
