<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import BleStatusBanner from './template/components/BleStatusBanner.vue';
import { useDuckHunt } from './state/duckHunt';

const route = useRoute();
const store = useDuckHunt();
const showBleStatus = computed(() => route.name !== 'landing');
let cleanup: () => void = () => undefined;

watch(() => route.name, () => {
  cleanup();
  cleanup = showBleStatus.value ? store.bindBleState() : () => undefined;
}, { immediate: true });

onBeforeUnmount(() => cleanup());
</script>

<template>
  <BleStatusBanner v-if="showBleStatus" />
  <RouterView />
</template>
