import {defineStore} from 'pinia';
import {ref} from 'vue';
import {fetchEventSummary, ApiError, type EventSummary} from '../api/client';

/**
 * Per-event sales summary. Computed on the backend, so this is a
 * reconciliation view of committed orders — offline-queued orders that
 * haven't flushed yet are not reflected until they sync. The UI labels it
 * accordingly.
 */
export const useSummaryStore = defineStore('summary', () => {
    const summary = ref<EventSummary | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const loadedFor = ref<string | null>(null);

    async function load(eventId: string, showSpinner = true) {
        if (showSpinner) loading.value = true;
        error.value = null;
        try {
            summary.value = await fetchEventSummary(eventId);
            loadedFor.value = eventId;
        } catch (e) {
            error.value =
                e instanceof ApiError && e.status === 0
                    ? 'Offline — summary unavailable until reconnected.'
                    : 'Could not load the event summary.';
        } finally {
            loading.value = false;
        }
    }

    function clear() {
        summary.value = null;
        loadedFor.value = null;
        error.value = null;
    }

    return {summary, loading, error, loadedFor, load, clear};
});