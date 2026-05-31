# CGS POS — Vue web terminal for cgsKitchen

Standalone front-of-house POS for the food truck, built as a static web app
that runs in the **same Chromium-kiosk-on-a-Pi** pattern as the driver unit.
This first cut covers the ordering flow with **cash** payment, and is
**offline-tolerant**: it keeps working through a SIM7600 link drop and syncs
when connectivity returns.

## Why this architecture

The driver kiosk already runs Chromium fullscreen on labwc, loading a local
web app. This POS reuses that exact stack — a second Pi provisioned the same
way, only the launched URL differs. No new device class, one provisioning
playbook. The POS is **standalone**: it only consumes cgsKitchen endpoints,
caches data locally, and POSTs updates. New data needs become new endpoints
in cgsKitchen, not coupling into this app.

Payments use the **server-driven** Stripe Terminal model (when added later),
which the Verifone M425 supports — the reader connects over LAN, card data
never touches this app or its network in any sensitive form, and your backend
already has the `/api/terminal/*` plumbing. That's why a web client (not a
native app) is sufficient here.

## What it talks to

| Action | Endpoint | Auth | Offline |
|---|---|---|---|
| Load menu | `GET /api/public/menu` | none | served from cache |
| Create order | `POST /api/pos/orders` | `X-API-Key` | queued |
| Mark paid | `POST /api/orders/{id}/status` | `X-API-Key` | queued |
| Health probe | `GET /actuator/health` | none | — |

## Offline-tolerant design

Three pieces (`src/stores/`, `src/lib/db.ts`):

- **Menu cache** — `menu.ts` fetches the menu, persists it to IndexedDB, and
  boots from cache when the network is down so the cashier can always ring up.
  A banner shows when the displayed menu is stale.
- **Write queue** — `sync.ts` persists every mutating op (create order, set
  PAID) to IndexedDB and flushes them **FIFO** when online. A SIM7600 drop
  never loses a cash sale; the order shows as "pending" and syncs later.
- **Connectivity monitor** — `connectivity.ts` polls `/actuator/health`
  rather than trusting `navigator.onLine`, which is unreliable on cellular.

**Cash queues; card cannot.** A card charge on the M425 needs a live
round-trip to Stripe, so card flows (added later) will require connectivity.
Cash orders are just records and queue safely — the right behavior for a truck.

## The flattening (same as before)

`POST /api/pos/orders` takes a flat `PosLineItem` with no options field, so
each configured cart line is flattened in `toPosLineItem()` (`src/lib/cart.ts`):
deltas folded into `unitPriceCents`, choice labels appended to `name`
(`"Lamb Gyro (Cheddar, +Mint sauce)"`). One change point if the DTO later
grows structured options.

## Project layout

```
src/
  api/client.ts          fetch wrapper + endpoints + heartbeat
  lib/config.ts          Vite env config
  lib/db.ts              IndexedDB wrapper (kv + queue stores)
  lib/cart.ts            pricing, validation, FLATTENING (framework-agnostic)
  lib/format.ts          money(), clientId()
  stores/connectivity.ts heartbeat polling
  stores/sync.ts         durable write queue + flush
  stores/menu.ts         fetch + cache + cache fallback
  stores/cart.ts         cart state (wraps lib/cart)
  components/            AppButton, StatusBadge, MenuCard, OptionGroupSelector
  views/                 MenuView, ItemDetailView, CartView, PaidView
  App.vue                shell + navigation state
  main.ts                entry
```

## Develop

```bash
npm install
cp .env.example .env       # set VITE_API_BASE_URL, VITE_API_KEY, VITE_POS_ACTOR
npm run dev                # http://localhost:5173
```

`npm run typecheck` runs vue-tsc; `npm run build` typechecks then emits `dist/`.

## Deploy to the Pi kiosk

The build output is plain static files with **relative** asset paths, so it
loads via `file://` exactly like your driver dashboard. Two options:

**A. Mirror the driver unit (recommended).** Provision a second Pi with the
same buildout doc (labwc + systemd autologin + `update.sh` git pull). In the
kiosk repo, build and commit `dist/`, or have `update.sh` run `npm ci &&
npm run build` after the pull. Point `launch.sh` at the built file:

```bash
exec chromium \
  --kiosk --noerrdialogs --disable-infobars --no-first-run \
  --ozone-platform=wayland --password-store=basic \
  --enable-features=UseOzonePlatform --touch-events=enabled \
  --app=file:///home/druid-mobile/celtech-pos/dist/index.html
```

**B. Serve from the network** and point `--app=` at the URL instead. Simpler
rebuilds, but then the kiosk needs connectivity to load the shell (the offline
queue still protects in-session drops).

## Offline-readiness checklist (do before relying on offline)

1. **Self-host fonts.** `index.html` currently pulls Barlow Condensed + Inter
   from Google Fonts, which needs network on first paint. Vendor the woff2
   files into the repo and swap the `<link>` for a local `@font-face`.
   System-ui fallbacks already prevent a hard failure.
2. **Service worker (optional, stronger).** For full cold-start-offline,
   add a service worker (e.g. `vite-plugin-pwa`) so the app shell itself is
   cached. The IndexedDB menu/queue layer works without it, but the HTML/JS
   shell needs caching to launch with no network. Option A (file://) sidesteps
   this since the shell is local.
3. **Cleartext HTTP** is fine here (native fetch, no browser-vs-server CORS
   concerns), but if you later serve the shell over the network, keep the API
   reachable on the LAN IP in `.env`.

## Roadmap

- Order-management board (`GET /api/orders/active`) — the "what's cooking" view.
- M425 card path: server-driven via `/api/terminal/connection-token` +
  `/api/terminal/payment-intent`, gated on connectivity.
- Receipt printer + cash-drawer kick (see hardware/power notes — separate track).

## Note on the duplicate status endpoint

The backend has two `POST /api/orders/{id}/status` handlers
(`PosApiController` and `OrderStatusController`) with different bodies — Spring
will fail on ambiguous mapping if both register. This app targets the
`OrderStatusController` shape (`{status, actor, note}`); drop `actor`/`note`
in `api/client.ts` if you keep the other one.
