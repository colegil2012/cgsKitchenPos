import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {
  fetchAllMenu,
  setItemAvailability,
  setChoiceAvailability,
  ApiError,
} from '../api/client';
import type {
  MenuItemView,
  OptionGroupView,
  OptionChoiceView,
} from '../types/menu';
import {useConnectivityStore} from './connectivity';

/**
 * Inventory board state — the full menu (including 86'd items) plus
 * availability toggles. ONLINE-ONLY: 86'ing persists to the cgsKitchen DB
 * and affects the public storefront, so a stale offline toggle replayed
 * later could clobber a newer change made elsewhere. Buttons disable when
 * offline rather than queue.
 */

interface InventorySection {
  categoryName: string;
  sortKey: number;
  items: MenuItemView[];
}

/** An option group with its choices, for the choices section (deduped
 *  across all menu items that share the group). */
interface ChoiceGroup {
  id: string;
  label: string;
  choices: OptionChoiceView[];
}

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref<MenuItemView[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastUpdated = ref<number | null>(null);
  /** Ids (item or choice) currently mid-toggle, to disable their controls. */
  const working = ref<Set<string>>(new Set());

  const sections = computed<InventorySection[]>(() => {
    const map = new Map<string, InventorySection>();
    for (const item of items.value) {
      const key = item.categoryName || 'Other';
      if (!map.has(key)) {
        map.set(key, {categoryName: key, sortKey: item.sortOrder, items: []});
      }
      map.get(key)!.items.push(item);
    }
    const arr = [...map.values()];
    arr.forEach(s => s.items.sort((a, b) => a.sortOrder - b.sortOrder));
    arr.sort((a, b) => a.sortKey - b.sortKey);
    return arr;
  });

  /**
   * All option groups across the menu, deduped by group id, each with its
   * choices. The same group (e.g. "Protein") may be attached to several
   * items; we surface it once. Sorted by group label.
   */
  const choiceGroups = computed<ChoiceGroup[]>(() => {
    const map = new Map<string, ChoiceGroup>();
    for (const item of items.value) {
      for (const g of item.optionGroups as OptionGroupView[]) {
        if (!g.choices || g.choices.length === 0) continue;
        if (!map.has(g.id)) {
          map.set(g.id, {id: g.id, label: g.label, choices: g.choices});
        }
      }
    }
    const arr = [...map.values()];
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  });

  const availableCount = computed(
    () => items.value.filter(i => i.available).length,
  );
  
  const offlineCount = computed(
    () => items.value.filter(i => !i.available).length,
  );

  async function load(showSpinner = true) {
    if (showSpinner) loading.value = true;
    error.value = null;
    try {
      items.value = await fetchAllMenu();
      lastUpdated.value = Date.now();
    } catch (e) {
      error.value =
        e instanceof ApiError && e.status === 0
          ? 'Offline — cannot load inventory.'
          : e instanceof ApiError && (e.status === 401 || e.status === 403)
            ? 'Not authorized — check the API key.'
            : 'Could not load inventory.';
    } finally {
      loading.value = false;
    }
  }

  function setWorking(id: string, on: boolean) {
    const next = new Set(working.value);
    if (on) next.add(id);
    else next.delete(id);
    working.value = next;
  }

  function requireOnline(): boolean {
    const connectivity = useConnectivityStore();
    if (!connectivity.online) {
      error.value = 'Offline — availability changes need a connection.';
      return false;
    }
    return true;
  }

  async function toggleItem(item: MenuItemView): Promise<void> {
    if (!requireOnline()) return;
    setWorking(item.id, true);
    error.value = null;
    try {
      const updated = await setItemAvailability(item.id, !item.available);
      items.value = items.value.map(i => (i.id === updated.id ? updated : i));
    } catch (e) {
      error.value =
        e instanceof ApiError ? e.message : 'Could not update item.';
      void load(false); // resync truth
    } finally {
      setWorking(item.id, false);
    }
  }

  async function toggleChoice(
    groupId: string,
    choiceId: string,
    nextAvailable: boolean,
    reason?: string,
  ): Promise<void> {
    if (!requireOnline()) return;
    setWorking(choiceId, true);
    error.value = null;
    try {
      const result = await setChoiceAvailability(
        choiceId,
        nextAvailable,
        reason,
      );
      // Patch the choice EVERYWHERE it appears. The same option group/choice
      // can be attached to multiple menu items, so we update every occurrence
      // — not just one item — to keep the view consistent without a reload.
      items.value = items.value.map(item => ({
        ...item,
        optionGroups: item.optionGroups.map(g => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            choices: g.choices.map(c =>
              c.id === choiceId
                ? {
                    ...c,
                    available: result.available,
                    unavailableReason: result.unavailableReason,
                  }
                : c,
            ),
          };
        }),
      }));
    } catch (e) {
      error.value =
        e instanceof ApiError ? e.message : 'Could not update choice.';
      void load(false);
    } finally {
      setWorking(choiceId, false);
    }
  }

  return {
    items,
    loading,
    error,
    lastUpdated,
    working,
    sections,
    choiceGroups,
    availableCount,
    offlineCount,
    load,
    toggleItem,
    toggleChoice,
  };
});