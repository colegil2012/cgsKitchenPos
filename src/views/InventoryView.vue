<script setup lang="ts">
import {onMounted} from 'vue';
import {useInventoryStore} from '../stores/inventory';
import {useConnectivityStore} from '../stores/connectivity';
import InventoryItemRow from '../components/InventoryItemRow.vue';
import InventoryChoiceRow from '../components/InventoryChoiceRow.vue';

const inventory = useInventoryStore();
const connectivity = useConnectivityStore();

onMounted(() => {
  if (inventory.items.length === 0) inventory.load();
});
</script>

<template>
  <div class="view">
    <header class="bar">
      <div>
        <h2 class="title">Inventory</h2>
        <span class="summary">
          {{ inventory.availableCount }} on ·
          {{ inventory.offlineCount }} 86'd
        </span>
      </div>
      <button class="refresh tap" @click="inventory.load(true)" aria-label="Refresh">
        ↻
      </button>
    </header>
 
    <p v-if="!connectivity.online" class="offline">
      Offline — availability changes are paused until the connection returns.
    </p>
    <p v-if="inventory.error" class="err">{{ inventory.error }}</p>
 
    <div v-if="inventory.loading && inventory.items.length === 0" class="center">
      <div class="spinner" />
      <p>Loading inventory…</p>
    </div>
 
    <div v-else class="scroll body">
      <!-- ============ MENU ITEMS ============ -->
      <div class="block">
        <h2 class="block-title">Menu Items</h2>
        <section
          v-for="section in inventory.sections"
          :key="section.categoryName"
          class="section">
          <h3 class="section-title">{{ section.categoryName }}</h3>
          <div class="menu-grid">
            <InventoryItemRow
              v-for="item in section.items"
              :key="item.id"
              :item="item" />
          </div>
        </section>
      </div>
 
      <!-- ============ CHOICES ============ -->
      <div class="block" v-if="inventory.choiceGroups.length">
        <h2 class="block-title">Inventory Items</h2>
        <section
          v-for="group in inventory.choiceGroups"
          :key="group.id"
          class="section">
          <h3 class="section-title">{{ group.label }}</h3>
          <div class="choice-grid">
            <InventoryChoiceRow
              v-for="choice in group.choices"
              :key="choice.id"
              :group-id="group.id"
              :choice="choice" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>


<style scoped>
.view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}
.title {
  font-size: var(--fs-3xl);
}
.summary {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
}
.refresh {
  width: 44px;
  height: 44px;
  font-size: 20px;
  color: var(--color-orange);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-white);
}
.offline {
  background: var(--color-honey);
  color: var(--color-ink);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  padding: 8px 16px;
  margin: 0;
}
.err {
  background: var(--color-danger);
  color: var(--color-white);
  font-size: 13px;
  text-align: center;
  padding: 8px 16px;
  margin: 0;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-muted);
}
.body {
  flex: 1;
  padding: 0 16px 24px;
}
.block-title {
  font-size: var(--fs-3xl);
  color: var(--color-gold-dark);
  border-left: 4px solid var(--color-grass-dark);
  padding: 24px 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.section {
  margin-bottom: 24px;
}
.section-title {
  font-size: var(--fs-2xl);
  color: var(--color-ink);
  background: var(--color-paper-2);
  border-bottom: 2px solid var(--color-grass-dark);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  padding: 12px;
  text-transform: uppercase;
  margin-top: 16px;
  letter-spacing: 0.05em;
}
.menu-grid {
  display: grid;
  background: var(--color-white);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  grid-template-columns: repeat(1, 1fr);
}
.choice-grid {
  display: grid;
  background: var(--color-white);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  grid-template-columns: repeat(2, 1fr);
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-paper-2);
  border-top-color: var(--color-orange);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>