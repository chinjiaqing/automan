<template>
  <div class="flow-node flow-node--start">
    <div class="flow-node__icon bg-green-500">
      <i class="pi pi-play text-white text-xs" />
    </div>
    <span class="flow-node__label">开始</span>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
</script>
