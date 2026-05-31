<script setup lang="ts">
defineProps<{
  label: string;
  variant?: 'primary' | 'success' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}>();
defineEmits<{(e: 'click'): void}>();
</script>

<template>
  <button
    class="btn tap"
    :class="[`btn--${variant ?? 'primary'}`, {'btn--disabled': disabled || loading}]"
    :disabled="disabled || loading"
    @click="$emit('click')">
    <span v-if="loading" class="btn__spinner" />
    <span v-else>{{ label }}</span>
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 54px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.3px;
  transition: filter 0.12s ease, transform 0.06s ease;
}
.btn:active {
  transform: scale(0.98);
}
.btn--primary {
  background: var(--color-orange);
  color: var(--color-white);
}
.btn--success {
  background: var(--color-grass);
  color: var(--color-white);
}
.btn--ghost {
  background: transparent;
  color: var(--color-ink);
  border: 1px solid var(--color-border);
}
.btn--danger {
  background: var(--color-danger);
  color: #fff;
}
.btn--disabled {
  opacity: 0.45;
  pointer-events: none;
}
.btn__spinner {
  width: 22px;
  height: 22px;
  border: 3px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>