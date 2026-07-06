import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import {fetchMenu, ApiError} from '../api/client';
import {kvGet, kvSet} from '../lib/db';
import type {MenuItemView} from '../types/menu';

const CACHE_KEY = 'menu:available';
const CACHE_TS_KEY = 'menu:cachedAt';

interface MenuSection {
  categoryName: string;
  sortKey: number;
  items: MenuItemView[];
}

/**
 * Menu cache strategy: try the network; on success persist to IndexedDB.
 * On failure (offline), fall back to the cached copy so the cashier can
 * always ring up orders. `stale` flags that the displayed menu came from
 * cache and may be out of date.
 */
export const useMenuStore = defineStore('menu', () => {
  const items = ref<MenuItemView[]>([]);
  const loading = ref(false);
  const stale = ref(false);
  const cachedAt = ref<number | null>(null);
  const error = ref<string | null>(null);
  /** Free-text search over item names/descriptions. Empty = no filter. */
  const search = ref('');

  /**
   * Categories with their items. 86'd items are now INCLUDED (shown greyed
   * in the UI) rather than hidden, so staff can see what's out — matching how
   * unavailable option choices are surfaced. Search filters by name and
   * description; a category with no matches is dropped.
   */
  const sections = computed<MenuSection[]>(() => {
    const q = search.value.trim().toLowerCase();
    const map = new Map<string, MenuSection>();
    for (const item of items.value) {
      if (q) {
        const hay = `${item.name} ${item.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const key = item.categoryName || 'Other';
      if (!map.has(key)) {
        map.set(key, {categoryName: key, sortKey: item.sortOrder, items: []});
      }
      map.get(key)!.items.push(item);
    }
    const arr = [...map.values()];
    // Available first within a category, then by sortOrder — keeps 86'd items
    // visible but out of the way at the bottom of their section.
    arr.forEach(s =>
      s.items.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      }),
    );
    arr.sort((a, b) => a.sortKey - b.sortKey);
    return arr;
  });

  /** Category names in display order — for the quick-jump chips. */
  const categoryNames = computed(() => sections.value.map(s => s.categoryName));

  async function loadFromCache() {
    const cached = await kvGet<MenuItemView[]>(CACHE_KEY);
    if (cached && cached.length) {
      items.value = cached;
      cachedAt.value = (await kvGet<number>(CACHE_TS_KEY)) ?? null;
      stale.value = true;
      return true;
    }
    return false;
  }

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const data = await fetchMenu();
      items.value = data;
      stale.value = false;
      const now = Date.now();
      cachedAt.value = now;
      await kvSet(CACHE_KEY, data);
      await kvSet(CACHE_TS_KEY, now);
    } catch (e) {
      // Network failed — fall back to cache if we have one.
      const hadCache = await loadFromCache();
      if (!hadCache) {
        error.value =
          e instanceof ApiError && e.status === 0
            ? 'Offline and no cached menu yet. Connect once to load the menu.'
            : 'Could not load the menu.';
      }
    } finally {
      loading.value = false;
    }
  }

  function findById(id: string): MenuItemView | undefined {
    return items.value.find(i => i.id === id);
  }

  return {items, loading, stale, cachedAt, error, search, sections, categoryNames, load, findById};
});