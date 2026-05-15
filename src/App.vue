<script setup lang="ts">
import { onMounted, ref, watchEffect } from 'vue';
import Board from './ui/components/Board.vue';
import TopNav from './ui/components/TopNav.vue';
import { applyColorMode } from './ui/composables/useColorMode';
import { useSettings } from './ui/composables/useSettings';
import { useTheme, applyThemeVars } from './ui/composables/useTheme';
import { useTurnDriver } from './ui/composables/useTurnDriver';
import { useGameStore } from './ui/stores/game';

const store = useGameStore();
const running = ref(true);
const { activeTheme } = useTheme();
const { settings } = useSettings();

useTurnDriver(store, running);

// Apply theme CSS variables to document root on theme change. Single
// app-root effect — the useTheme composable itself stays pure.
watchEffect(() => {
  applyThemeVars(activeTheme.value.cssVars);
});

// Apply color mode by writing `color-scheme` onto documentElement. CSS
// `light-dark()` picks the right palette automatically; 'auto' lets the
// browser follow the OS preference.
watchEffect(() => {
  applyColorMode(settings.value.colorMode);
});

onMounted(() => {
  void store.init();
});
</script>

<template>
  <TopNav @new-game="store.newGame()" />
  <Board />
</template>
