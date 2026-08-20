<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { t } from '../i18n';
import { useDuckHunt } from '../state/duckHunt';

const router = useRouter();
const store = useDuckHunt();
const ready = ref(false);

async function openGame() {
  if (!ready.value) {
    ready.value = await store.openOnDevice();
    if (ready.value) void store.connectDevice();
    return;
  }
  await router.push('/game');
}
</script>

<template>
  <main class="landing">
    <div class="pixel-cloud cloud-one" aria-hidden="true" />
    <div class="pixel-cloud cloud-two" aria-hidden="true" />
    <div class="landing-copy">
      <p class="landing-kicker">PIXELMUG GAME</p>
      <h1><span>DUCK</span><span>HUNT</span></h1>
      <p>{{ t('landing.subtitle') }}</p>
    </div>
    <div class="landing-actions">
      <button :disabled="!ready && store.busy.value" @click="openGame">
        {{ ready ? t('landing.enter') : store.openButtonLabel.value }}
      </button>
      <small v-if="ready || store.statusText.value">
        {{ ready ? t('status.launchReady') : store.statusText.value }}
      </small>
    </div>
    <div class="pixel-grass" aria-hidden="true" />
  </main>
</template>
