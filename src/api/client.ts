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

export function fetchMenu(signal?: AbortSignal): Promise<MenuItemView[]> {
  return request<MenuItemView[]>('/api/public/menu', {auth: false, signal});
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