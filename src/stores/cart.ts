import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {
  type CartLine,
  TAX_RATE,
  lineTotalCents,
  toPosLineItem,
} from '../lib/cart';
import type {PosOrderRequest} from '../types/menu';
import {createPosOrder} from '../api/client';

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([]);

  const subtotalCents = computed(() =>
    lines.value.reduce((acc, l) => acc + lineTotalCents(l), 0),
  );
  const taxCents = computed(() => Math.round(subtotalCents.value * TAX_RATE));
  const totalCents = computed(() => subtotalCents.value + taxCents.value);
  const count = computed(() =>
    lines.value.reduce((acc, l) => acc + l.quantity, 0),
  );

  function add(line: CartLine) {
    lines.value.push(line);
  }
  function remove(lineId: string) {
    lines.value = lines.value.filter(l => l.lineId !== lineId);
  }
  function setQty(lineId: string, quantity: number) {
    const q = Math.max(0, quantity);
    lines.value = lines.value
      .map(l => (l.lineId === lineId ? {...l, quantity: q} : l))
      .filter(l => l.quantity > 0);
  }
  function clear() {
    lines.value = [];
  }

  /**
 * Create the order on the server for a CARD payment and return its id.
 * Unlike the cash path this does NOT clear the cart — we keep the cart intact
 * until the card actually succeeds, so a decline/cancel leaves the order
 * recoverable and the cashier can retry or switch to cash. CartView clears on
 * confirmed payment.
 *
 * Throws (ApiError) if offline or the create fails — card is online-only and
 * the caller surfaces the error.
 */
async function createCardOrder(
  eventId: string | null,
  customer?: {userId: string; customerName: string | null} | null,
): Promise<string> {
  const req = toOrderRequest(eventId, customer);
  const order = await createPosOrder(req);
  return order.id;
}


  function toOrderRequest(
    eventId: string | null,
    customer?: {userId: string; customerName: string | null} | null,
  ): PosOrderRequest {
    return {
      items: lines.value.map(toPosLineItem),
      eventId,
      userId: customer?.userId ?? null,
      customerName: customer?.customerName ?? null,
      customerEmail: null,
    };
  }

  return {
    lines,
    subtotalCents,
    taxCents,
    totalCents,
    count,
    add,
    remove,
    setQty,
    clear,
    toOrderRequest,
    createCardOrder,
  };
});