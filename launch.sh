#!/bin/bash
# =============================================================
# CGS Kitchen POS — Kiosk Launch Script (Raspberry Pi 5)
# Option B: the app shell is served locally over HTTP by the
# cgs-pos-web.service systemd unit on 127.0.0.1:6173, so the
# browser origin is http://localhost:6173 (whitelisted on the
# backend) rather than the file:// null origin.
#
# Calls the REAL chromium binary at /usr/lib/chromium/chromium
# to bypass the /usr/bin/chromium wrapper, which sources
# /etc/chromium.d/* and injects desktop flags (--load-extension,
# --js-flags=--no-decommit-pooled-pages, Google sync keys, etc.)
# we don't want on a locked kiosk.
# =============================================================
sleep 5

# Wait for the local static server to be up before launching the
# browser (systemd starts it, but ordering across the labwc
# autostart boundary isn't guaranteed, so we poll briefly).
for i in $(seq 1 20); do
  if curl -sf -o /dev/null http://localhost:6173/ ; then
    break
  fi
  sleep 1
done

exec /usr/lib/chromium/chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --ozone-platform=wayland \
  --password-store=basic \
  --enable-features=UseOzonePlatform \
  --touch-events=enabled \
  --force-device-scale-factor=1 \
  --disable-session-crashed-bubble \
  --disable-popup-blocking \
  --remote-debugging-port=9222 \
  --app=http://localhost:6173