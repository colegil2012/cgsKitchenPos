#!/bin/bash
# =============================================================
# CGS Kitchen POS — Kiosk Launch Script (Raspberry Pi 5)
# Launches Chromium fullscreen at the built Vue app (dist/).
# The POS is a touch unit, so --touch-events is enabled.
# =============================================================
sleep 5

exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --ozone-platform=wayland \
  --password-store=basic \
  --allow-file-access-from-files \
  --enable-features=UseOzonePlatform \
  --touch-events=enabled \
  --force-device-scale-factor=1 \
  --disable-session-crashed-bubble \
  --disable-popup-blocking \
  --app=file:///home/druid-pos/celtech-pos/dist/index.html
