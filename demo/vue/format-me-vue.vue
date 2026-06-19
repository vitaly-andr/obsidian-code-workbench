<script setup>
// Mis-formatted on purpose. Run "Format code file".
import {ref,computed} from "vue";
const name=ref("Ada");const roles=ref(["admin","editor"]);
const isAdmin=computed(()=>roles.value.includes("admin"));
function addRole(role){roles.value.push(role);}
</script>
<template>
<main class="card"><h1>{{ name }}</h1><span v-if="isAdmin" class="badge">Admin</span>
<ul><li v-for="role in roles" :key="role">{{ role }}</li></ul></main>
</template>
<style scoped>
.card{max-width:400px;margin:0 auto;}.badge{color:#0a84ff;}
</style>
