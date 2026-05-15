<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Board from './ui/components/Board.vue';
import TopNav from './ui/components/TopNav.vue';
import { useTurnDriver } from './ui/composables/useTurnDriver';
import { useGameStore } from './ui/stores/game';

const store = useGameStore();
const running = ref(true);

useTurnDriver(store, running);

onMounted(() => {
  void store.init();
});
</script>

<template>
  <TopNav @new-game="store.newGame()" />
  <Board />
</template>
