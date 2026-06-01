<script setup lang="ts">
import {useEventStore} from '../stores/event';

const eventStore = useEventStore();
</script>

<template>
  <!-- Live: green serving strip. Not live: amber "closed" strip pointing
       the cashier to the Events tab to activate. Slim, glanceable, no
       controls — activation lives on the Events tab. -->
  <div v-if="eventStore.live" class="strip live">
    <span class="dot" />
    <span class="text">
      Serving · <strong>{{ eventStore.live.title }}</strong>
      <span v-if="eventStore.live.location" class="loc">
        — {{ eventStore.live.location }}
      </span>
    </span>
  </div>

  <div v-else class="strip closed">
    <span class="text">
      No active event — open the <strong>Events</strong> tab to activate before taking orders.
    </span>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
}
.live {
  background: var(--color-grass-dark);
  color: var(--color-white);
}
.closed {
  background: var(--color-honey);
  color: var(--color-ink);
  font-weight: 600;
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
.text strong {
  font-weight: 700;
}
.loc {
  opacity: 0.85;
}
</style>