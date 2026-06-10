<script setup lang="ts">
import {computed} from 'vue';
import {useEventStore} from '../stores/event';
import {useConnectivityStore} from '../stores/connectivity';

const eventStore = useEventStore();
const connectivity = useConnectivityStore();

const next = computed(() => eventStore.next);

/** "in 12 min" style hint for when activation opens. */
const opensInLabel = computed(() => {
  const ms = eventStore.activatesInMs;
  if (ms === null || ms <= 0) return null;
  const mins = Math.ceil(ms / 60000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} min`;
});

function fmtWindow(startAt: string | null, endAt: string | null): string {
  if (!startAt) return '';
  const s = new Date(startAt);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  };
  const startStr = s.toLocaleString(undefined, opts);
  if (!endAt) return startStr;
  const e = new Date(endAt);
  const endStr = e.toLocaleString(undefined, {hour: 'numeric', minute: '2-digit'});
  return `${startStr} – ${endStr}`;
}

async function onActivate() {
  if (!next.value) return;
  await eventStore.activate(next.value);
}
</script>

<template>
  <!-- Live: compact serving strip -->
  <div v-if="eventStore.live" class="live">
    <span class="dot" />
    <span class="live-text">
      Serving · <strong>{{ eventStore.live.title }}</strong>
      <span v-if="eventStore.live.location" class="loc">
        — {{ eventStore.live.location }}
      </span>
    </span>
  </div>

  <!-- Not live: next-event activation card -->
  <div v-else class="next-card">
    <div v-if="next">
      <div class="eyebrow">Next event</div>
      <div class="next-title">{{ next.title }}</div>
      <div v-if="next.location" class="next-loc">{{ next.location }}</div>
      <div class="next-window">
        {{ next.fromSeries ? 'Weekly' : fmtWindow(next.startAt, next.endAt) }}
      </div>

      <button
        class="activate tap"
        :disabled="!eventStore.canActivateNext || eventStore.activating || !connectivity.online"
        @click="onActivate">
        {{ eventStore.activating ? 'Activating…' : 'Activate Event' }}
      </button>

      <p v-if="!eventStore.canActivateNext && opensInLabel" class="gate-hint">
        Activates in {{ opensInLabel }}
      </p>
      <p v-else-if="!connectivity.online" class="gate-hint">
        Offline — reconnect to activate
      </p>
      <p v-if="eventStore.error" class="gate-err">{{ eventStore.error }}</p>
    </div>

    <div v-else class="no-next">
      <div class="eyebrow">No event scheduled</div>
      <p class="no-next-text">
        Nothing on the calendar right now. Orders can't be taken until an
        event is active.
      </p>
    </div>
  </div>
</template>

<style scoped>
.live {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-grass-dark);
  color: var(--color-white);
  padding: 8px 16px;
  font-size: 14px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-white);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.live-text strong {
  font-weight: 700;
}
.loc {
  opacity: 0.85;
}

.next-card {
  margin: 12px 16px;
  padding: 16px;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: center;
}
.eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-muted);
}
.next-title {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  color: var(--color-ink);
  margin-top: 4px;
}
.next-loc {
  font-size: 14px;
  color: var(--color-muted);
  margin-top: 2px;
}
.next-window {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-ink-soft);
  margin-top: 6px;
}
.activate {
  margin-top: 14px;
  min-height: 52px;
  width: 100%;
  max-width: 320px;
  background: var(--color-orange);
  color: var(--color-white);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.activate:disabled {
  opacity: 0.4;
}
.gate-hint {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
  margin: 8px 0 0;
}
.gate-err {
  font-size: 13px;
  color: var(--color-danger);
  margin: 8px 0 0;
}
.no-next-text {
  font-size: 14px;
  color: var(--color-muted);
  margin: 8px 0 0;
}
</style>