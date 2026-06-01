import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {
  type CartLine,
  TAX_RATE,
  lineTotalCents,
  toPosLineItem,
} from '../lib/cart';
import type {PosOrderRequest} from '../types/menu';

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
  };
});