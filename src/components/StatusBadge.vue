<script setup lang="ts">
import {computed} from 'vue';
import {useConnectivityStore} from '../stores/connectivity';
import {useSyncStore} from '../stores/sync';

const connectivity = useConnectivityStore();
const sync = useSyncStore();

const label = computed(() => {
  if (!connectivity.online) return 'Offline';
  if (sync.flushing) return 'Syncing…';
  if (sync.pendingCount > 0) return `${sync.pendingCount} pending`;
  return 'Online';
});

const tone = computed(() => {
  if (!connectivity.online) return 'offline';
  if (sync.pendingCount > 0 || sync.flushing) return 'pending';
  return 'online';
});
</script>

<template>
  <button
    class="status"
    :class="`status--${tone}`"
    @click="sync.flush()"
    title="Tap to retry sync">
    <span class="dot" />
    {{ label }}
  </button>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
  background: var(--color-paper-2);
  color: var(--color-muted);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentColor;
}
.status--online {
  color: var(--color-grass);
}
.status--pending {
  color: var(--color-gold-dark);
}
.status--offline {
  color: var(--color-danger);
}
</style>