import {defineStore} from 'pinia';
import {ref} from 'vue';
import {heartbeat} from '../api/client';

/**
 * Real connectivity, not navigator.onLine (which is unreliable on
 * cellular/SIM7600 — it reports "online" when the modem is up even if the
 * backend is unreachable). We poll a cheap health endpoint.
 */
export const useConnectivityStore = defineStore('connectivity', () => {
  const online = ref<boolean>(true);
  const lastChecked = ref<number>(0);
  const checking = ref<boolean>(false);

  let timer: number | undefined;

  async function check(): Promise<boolean> {
    checking.value = true;
    try {
      const ok = await heartbeat();
      online.value = ok;
      lastChecked.value = Date.now();
      return ok;
    } finally {
      checking.value = false;
    }
  }

  function start(intervalMs = 15000) {
    if (timer !== undefined) return;
    check();
    timer = window.setInterval(check, intervalMs);
    // Browser hints — treat as a nudge to re-check, not ground truth.
    window.addEventListener('online', check);
    window.addEventListener('offline', () => {
      online.value = false;
    });
  }

  function stop() {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  return {online, lastChecked, checking, check, start, stop};
});
