<script setup>
const name = "Ada";
</script>

<!-- error: the interpolation {{ is never closed with }} -->
<template>
  <main>{{ name </main>
</template>
