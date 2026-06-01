# CGS POS — Vue web terminal for cgsKitchen

Standalone front-of-house POS for the food truck, built as a static web app
that runs in the **same Chromium-kiosk-on-a-Pi** pattern as the driver unit.
It covers the ordering flow with **cash** payment, a kitchen order board,
inventory (86'ing), and per-event sales reporting. It is **offline-tolerant**:
it keeps working through a SIM7600 link drop and syncs when connectivity
returns.

## Why this architecture

The driver kiosk for the general store already runs Chromium fullscreen on labwc, 
loading a local web app. This POS reuses that exact stack — a second Pi provisioned the same
way, only the launched URL differs. No new device class, one provisioning
playbook. The POS is **standalone**: it only consumes cgsKitchen endpoints,
caches data locally, and POSTs updates. New data needs become new endpoints
in cgsKitchen, not coupling into this app.

Payments use the **server-driven** Stripe Terminal model (when added later),
which the Verifone M425 supports — the reader connects over LAN, card data
never touches this app or its network in any sensitive form, and your backend
already has the `/api/terminal/*` plumbing. That's why a web client (not a
native app) is sufficient here.

## Authentication

Every request defaults to sending the `X-API-Key` header (set from
`VITE_API_KEY`, which must match the backend `app.api-key`). The only
exception is the health probe, which is unauthenticated. All POS endpoints
live on the backend's API-key filter chain (`/api/**`); there is no public,
keyless endpoint anymore — the menu read was consolidated onto the authed
chain when the old `/api/public/menu` was removed.

## What it talks to

All endpoints are on the cgsKitchen backend. "Offline" describes what happens
on a connectivity drop.

### Menu & inventory

| Action | Endpoint | Offline |
|---|---|---|
| Load orderable menu | `GET /api/menu/menu` | served from IndexedDB cache |
| Load full menu incl. 86'd | `GET /api/menu/all` | fails (inventory is online-only) |
| 86 / un-86 a menu item | `POST /api/menu/items/{id}/availability` | blocked (online-only) |
| 86 / un-86 an option choice | `POST /api/menu/choices/{id}/availability` | blocked (online-only) |

### Orders

| Action | Endpoint | Offline |
|---|---|---|
| Create order | `POST /api/pos/orders` | queued (FIFO) |
| Confirm cash payment | `POST /api/orders/{id}/cash-payment` | queued (after create) |
| Advance / cancel status | `POST /api/orders/{id}/status` | blocked (online-only) |
| Active kitchen orders | `GET /api/orders/active` | last-known; polls when online |

### Events & reporting

| Action | Endpoint | Offline |
|---|---|---|
| Live + next event status | `GET /api/events/status` | last-known |
| Activate an event | `POST /api/events/{id}/activate` | blocked (online-only) |
| Per-event sales summary | `GET /api/events/{id}/summary` | unavailable until reconnected |

### Customers & health

| Action | Endpoint | Offline |
|---|---|---|
| Look up customer by email | `GET /api/pos/customers/lookup?email=` | blocked (online-only) |
| Health probe | `GET /actuator/health` | — (this *is* the connectivity check) |

## Features

### Ordering (cash)
Menu grouped by category with item options (single/multi, required, 86-aware).
Cash checkout queues durably and confirms payment via the dedicated
`/cash-payment` endpoint. An order can optionally be attached to a registered
customer via email lookup; skipped, it's a walk-in.

### Kitchen order board
A three-column board (New -> In Kitchen -> Ready) backed by
`GET /api/orders/active`, polled every 10s. Advance/cancel actions go through
the validated `/status` endpoint, so the backend transition matrix is the
source of truth. Online-only — a stale "mark ready" applied late is wrong, so
these don't queue.

### Inventory (86'ing)
Two sections — menu items (by category) and option choices (by group). Each
has a one-tap On/86 toggle; 86'ing a choice can capture an optional reason.
Changes persist to the cgsKitchen DB (the storefront sees them too) and are
online-only.

### Events & sales reporting
The Events tab shows the live event with a backend-computed sales summary —
income (per-order list, searchable, with totals split by payment method) and
items sold (rolled up by item with a modifier-level breakdown). When no event
is live it shows the next scheduled event with a 15-minute-gated Activate
button. The summary is a reconciliation view of committed orders, so orders
still sitting in the offline queue aren't counted until they flush.

## Event linkage (no orphaned orders)

Every order carries an `eventId`. The POS captures the active event at ring-up
and sends it as order metadata; the backend rejects an order with no eventId.
The guard checks **existence, not liveness** — an offline cash order flushed
*after* its event ended still binds to that (now-ended) event, which is correct
attribution rather than an error. Web ordering closes on liveness; order
insertion only requires the event to exist.

## Offline-tolerant design

Core pieces (`src/stores/`, `src/lib/db.ts`):

- **Menu cache** — `menu.ts` fetches the menu, persists it to IndexedDB, and
  boots from cache when the network is down so the cashier can always ring up.
  A banner shows when the displayed menu is stale.
- **Write queue** — `sync.ts` persists every queueable mutating op (create
  order, confirm cash) to IndexedDB and flushes them **FIFO** when online. A
  SIM7600 drop never loses a cash sale; the order shows as pending and syncs
  later, carrying its captured `eventId` and any attached customer with it.
- **Connectivity monitor** — `connectivity.ts` polls `/actuator/health`
  rather than trusting `navigator.onLine`, which is unreliable on cellular.

**Cash queues; card cannot.** A card charge on the M425 needs a live
round-trip to Stripe, so card flows (added later) will require connectivity.
Cash orders are just records and queue safely. Status changes, inventory
toggles, event activation, and the summary are all **online-only** by design —
each is shared mutable state where a stale, late-replayed action would be
wrong, unlike an additive cash-sale record.

## The flattening

`POST /api/pos/orders` takes a flat `PosLineItem` with no options field, so
each configured cart line is flattened in `toPosLineItem()` (`src/lib/cart.ts`):
deltas folded into `unitPriceCents`, choice labels appended to `name`
(`"Lamb Gyro (Cheddar, +Mint sauce)"`). One change point if the DTO later
grows structured options.

## Project layout

```
src/
  api/client.ts            fetch wrapper + all endpoints + heartbeat
  lib/config.ts            Vite env config + HEARTBEAT_PATH
  lib/db.ts                IndexedDB wrapper (kv + queue stores)
  lib/cart.ts              pricing, validation, FLATTENING (framework-agnostic)
  lib/format.ts            money(), clientId(), badgeColor()
  stores/connectivity.ts   heartbeat polling
  stores/sync.ts           durable write queue + flush
  stores/menu.ts           fetch + cache + cache fallback
  stores/cart.ts           cart state (wraps lib/cart)
  stores/orders.ts         kitchen board (active orders, transitions)
  stores/inventory.ts      full menu + availability toggles
  stores/event.ts          live/next event, activation gating
  stores/summary.ts        per-event sales summary
  components/              AppButton, StatusBadge, MenuCard, OrderCard,
                           OptionGroupSelector, InventoryItemRow,
                           InventoryChoiceRow, EventStatusStrip
  views/                   MenuView, ItemDetailView, CartView, PaidView,
                           OrdersView, InventoryView, EventsView
  App.vue                  shell + side-nav (Menu / Orders / Inventory / Events)
  main.ts                  entry
```

## Develop

```bash
npm install
cp .env.example .env       # set VITE_API_BASE_URL, VITE_API_KEY, VITE_POS_ACTOR
npm run dev                # http://localhost:5173
```

`VITE_API_KEY` must match the backend `app.api-key`. For local backend dev,
set `API_KEY` and add `http://localhost:5173` to `CORS_ORIGINS` in the
cgsKitchen run config. `npm run typecheck` runs vue-tsc; `npm run build`
typechecks then emits `dist/`.

## Deploy to the Pi kiosk

The build output is plain static files with **relative** asset paths
(`base: './'`), so it loads via `file://` exactly like your driver dashboard.
Two options:

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

1. **Self-host fonts.** `index.html` pulls DM Serif Display, DM Sans, and
   JetBrains Mono from Google Fonts, which needs network on first paint.
   Vendor the woff2 files into the repo and swap the `<link>` for a local
   `@font-face`. System-ui fallbacks already prevent a hard failure.
2. **Service worker (optional, stronger).** For full cold-start-offline, add
   a service worker (e.g. `vite-plugin-pwa`) so the app shell itself is
   cached. The IndexedDB menu/queue layer works without it, but the HTML/JS
   shell needs caching to launch with no network. Option A (file://) sidesteps
   this since the shell is local.
3. **API reachable on the LAN IP.** If you serve the shell over the network,
   keep `VITE_API_BASE_URL` pointed at the backend's LAN IP.

## Roadmap

- **M425 card path.** Server-driven via `/api/terminal/connection-token` +
  `/api/terminal/payment-intent`, gated on connectivity. Sets
  `PaymentMethod.CARD` on the order so it splits correctly in the event
  summary; needs a cash/card discriminator added to the checkout flow.
- **Receipt printer + cash-drawer kick.** Separate hardware/power track.
- **Custom nav icons.** Hand-built or Lucide-sourced glyphs for the side-nav.
- **Branding/images.** Logo on the nav rail, favicon.
- **Self-hosted fonts + service worker** for full cold-start-offline (see
  checklist above).

## Production hardening notes

- The API key ships in the built bundle. Fine for one trusted kiosk on a
  private network; revisit (per-device key / backend proxy) before any
  broader rollout.
- Inventory toggles are last-write-wins and online-only. For a single-POS
  truck this is safe; multi-terminal would want timestamp-guarded toggles to
  avoid one terminal clobbering another's change.
