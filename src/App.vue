<script setup lang="ts">
import { onMounted, ref, watchEffect } from 'vue';
import Board from './ui/components/Board.vue';
import TopNav from './ui/components/TopNav.vue';
import { useTheme, applyThemeVars } from './ui/composables/useTheme';
import { useTurnDriver } from './ui/composables/useTurnDriver';
import { useGameStore } from './ui/stores/game';

const store = useGameStore();
const running = ref(true);
const { activeTheme } = useTheme();

useTurnDriver(store, running);

// Apply theme CSS variables to document root on theme change. Single
// app-root effect — the useTheme composable itself stays pure.
watchEffect(() => {
  applyThemeVars(activeTheme.value.cssVars);
});

onMounted(() => {
  void store.init();
});
</script>

<template>
  <TopNav @new-game="store.newGame()" />
  <Board />
</template>
