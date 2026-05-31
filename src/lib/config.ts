/**
 * Config from Vite env (import.meta.env). Set these in `.env` at the
 * project root (see .env.example). Vite inlines VITE_-prefixed vars at
 * BUILD time, so changing them requires a rebuild — appropriate for the
 * git-pull + npm run build kiosk deploy.
 *
 *   VITE_API_BASE_URL   e.g. http://192.168.1.50:8080  (no trailing slash)
 *   VITE_API_KEY        value of app.api-key on the server
 *   VITE_POS_ACTOR      label recorded on status transitions, e.g. "pos-1"
 */

function clean(v: string | undefined, fallback: string): string {
  return (v ?? fallback).replace(/\/+$/, '');
}

export const API_BASE_URL = clean(
  import.meta.env.VITE_API_BASE_URL,
  'http://localhost:8080',
);

export const API_KEY: string = import.meta.env.VITE_API_KEY ?? '';

export const POS_ACTOR: string = import.meta.env.VITE_POS_ACTOR ?? 'pos';

/** Heartbeat target — cheap, public, GET. Used by the connectivity monitor. */
export const HEARTBEAT_PATH = '/actuator/health';

if (!API_KEY) {
  console.warn(
    '[config] VITE_API_KEY is empty. Menu browse works (public), but ' +
      'order creation and status updates will be rejected by the server.',
  );
}
