import {API_BASE_URL, API_KEY, POS_ACTOR, HEARTBEAT_PATH} from '../lib/config';
import type {
  MenuItemView,
  OrderView,
  PosOrderRequest,
  UpdateStatusRequest,
} from '../types/menu';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const {method = 'GET', body, auth = true, signal, timeoutMs = 12000} = opts;

  const headers: Record<string, string> = {Accept: 'application/json'};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers['X-API-Key'] = API_KEY;

  // Combine an external signal with an internal timeout.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', () => ctrl.abort(), {once: true});
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    throw new ApiError(
      aborted
        ? `Request to ${path} timed out`
        : `Network request to ${path} failed`,
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && 'message' in (parsed as any)
        ? String((parsed as any).message)
        : `Request to ${path} failed (${res.status})`;
    throw new ApiError(msg, res.status, parsed);
  }
  return parsed as T;
}

// ---- Endpoints -----------------------------------------------------------

/**
 * GET /api/menu/menu — available menu items for ordering. Lives on the
 * authed chain (the old public /api/public/menu was consolidated into the
 * POS menu controller), so it carries the API key like the other POS calls.
 */
export function fetchMenu(signal?: AbortSignal): Promise<MenuItemView[]> {
  return request<MenuItemView[]>('/api/menu/menu', {signal});
}

export function createPosOrder(body: PosOrderRequest): Promise<OrderView> {
  return request<OrderView>('/api/pos/orders', {method: 'POST', body});
}

export function updateOrderStatus(
  orderId: string,
  status: string,
  note?: string,
): Promise<OrderView> {
  const body: UpdateStatusRequest = {
    status,
    actor: POS_ACTOR,
    note: note ?? null,
  };
  return request<OrderView>(`/api/orders/${orderId}/status`, {
    method: 'POST',
    body,
  });
}

/** GET /api/orders/active — all in-flight orders for the kitchen board. */
export function fetchActiveOrders(signal?: AbortSignal): Promise<OrderView[]> {
  return request<OrderView[]>('/api/orders/active', {signal});
}

/**
 * POST /api/orders/{id}/cash-payment — POS confirms a cash sale. The POS
 * is the payment authority for cash, so this reports a completed payment
 * (PENDING_PAYMENT → PAID) via the dedicated, idempotent server endpoint
 * rather than the kitchen-matrix /status path.
 */
export function confirmCashPayment(
  orderId: string,
  note?: string,
): Promise<OrderView> {
  return request<OrderView>(`/api/orders/${orderId}/cash-payment`, {
    method: 'POST',
    body: {actor: POS_ACTOR, note: note ?? 'cash payment (POS)'},
  });
}

/** Lightweight connectivity probe. Resolves true iff the server answers ok. */
export async function heartbeat(): Promise<boolean> {
  try {
    await request(HEARTBEAT_PATH, {auth: false, timeoutMs: 4000});
    return true;
  } catch {
    return false;
  }
}

// ---- Inventory (menu availability) --------------------------------------

/** GET /api/menu/all — full menu including 86'd items (key-auth). */
export function fetchAllMenu(signal?: AbortSignal): Promise<MenuItemView[]> {
  return request<MenuItemView[]>('/api/menu/all', {signal});
}

/** POST /api/menu/items/{id}/availability — 86 / un-86 a menu item. */
export function setItemAvailability(
  itemId: string,
  available: boolean,
): Promise<MenuItemView> {
  return request<MenuItemView>(`/api/menu/items/${itemId}/availability`, {
    method: 'POST',
    body: {available},
  });
}

export interface ChoiceAvailabilityResult {
  id: string;
  label: string;
  available: boolean;
  unavailableReason: string | null;
}

/** POST /api/menu/choices/{id}/availability — 86 / un-86 an option choice. */
export function setChoiceAvailability(
  choiceId: string,
  available: boolean,
  reason?: string,
): Promise<ChoiceAvailabilityResult> {
  return request<ChoiceAvailabilityResult>(
    `/api/menu/choices/${choiceId}/availability`,
    {method: 'POST', body: {available, reason: reason ?? null}},
  );
}

// ---- Events (active / next / activate) ----------------------------------

export interface EventView {
  /** Concrete event id. Null for a series *projection* (a not-yet-
   *  materialized future occurrence) — in that case activate via seriesId. */
  id: string | null;
  /** Set when this view is a series occurrence or projection. */
  seriesId: string | null;
  title: string;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  active: boolean;
  /** True if this came from a recurring series (occurrence or projection). */
  fromSeries: boolean;
  /** Stored online-ordering switch for this occurrence. Distinct from the
   *  derived customerOrderingOpen — this is the operator override (false =
   *  private / walk-in-only, or switched off live). POS ring-up is
   *  unaffected either way. */
  onlineOrderingOpen: boolean;
  canActivate: boolean;
}

export interface EventStatusView {
  /** Operator-open: a shift is active (may be past its customer window). */
  shiftLive: boolean;
  /** Customer-open: within the scheduled window right now (online ordering). */
  customerOrderingOpen: boolean;
  active: EventView | null;
  next: EventView | null;
}

/** GET /api/events/status — live shift + next scheduled, for the POS. */
export function fetchEventStatus(signal?: AbortSignal): Promise<EventStatusView> {
  return request<EventStatusView>('/api/events/status', {signal});
}

/**
 * POST /api/events/{id}/activate — activate a one-time concrete event.
 * For recurring series use {@link activateSeries} instead (the projection
 * has no concrete id until activation materializes one).
 */
export function activateEvent(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/events/${eventId}/activate`, {method: 'POST'});
}

/**
 * POST /api/events/series/{seriesId}/activate — materialize + activate the
 * current-slot occurrence of a recurring series. (Path lives under
 * /api/events/** so it's covered by the API-key security chain.) Returns
 * the concrete occurrence EventView (now with a real id).
 */
export function activateSeries(seriesId: string): Promise<EventView> {
  return request<EventView>(`/api/events/series/${seriesId}/activate`, {method: 'POST'});
}

/** POST /api/events/{id}/close — operator closes the open shift. */
export function closeShift(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/events/${eventId}/close`, {method: 'POST'});
}

/**
 * POST /api/events/{id}/online-ordering — switch online ordering on/off for
 * the live occurrence. Explicit set (idempotent). Turning it off stops
 * customer web orders while leaving POS ring-up fully working. Returns the
 * updated EventView.
 */
export function setOnlineOrdering(
  eventId: string,
  enabled: boolean,
): Promise<EventView> {
  return request<EventView>(`/api/events/${eventId}/online-ordering`, {
    method: 'POST',
    body: {enabled},
  });
}

// ---- Event summary (per-event sales reporting) --------------------------

export interface SummaryOrderLine {
  orderId: string;
  customerName: string | null;
  paymentMethod: string; // CASH | CARD | OTHER | UNPAID
  fulfillment: string | null;
  status: string | null;
  totalCents: number;
  countedInTotal: boolean;
}

export interface SummaryIncome {
  totalCents: number;
  cashCents: number;
  cardCents: number;
  otherCents: number;
  countedOrders: number;
  totalOrders: number;
  orders: SummaryOrderLine[];
}

export interface SummaryItemVariant {
  modifiers: string[];
  quantity: number;
  revenueCents: number;
}

export interface SummaryItemSold {
  name: string;
  quantity: number;
  revenueCents: number;
  variants: SummaryItemVariant[];
}

export interface EventSummary {
  eventId: string;
  income: SummaryIncome;
  itemsSold: SummaryItemSold[];
}

/** GET /api/events/{id}/summary — backend-computed sales report. */
export function fetchEventSummary(
  eventId: string,
  signal?: AbortSignal,
): Promise<EventSummary> {
  return request<EventSummary>(`/api/events/${eventId}/summary`, {signal});
}

// ---- Customer lookup (attach a POS order to a registered user) ----------

export interface CustomerMatch {
  userId: string;
  displayName: string | null;
}

/**
 * GET /api/pos/customers/lookup?email= — resolve an email to a registered
 * user. Resolves to the match, or null when there's no registered customer
 * with that email (the endpoint 404s, which we translate to null here).
 */
export async function lookupCustomer(
  email: string,
): Promise<CustomerMatch | null> {
  try {
    return await request<CustomerMatch>(
      `/api/pos/customers/lookup?email=${encodeURIComponent(email)}`,
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}