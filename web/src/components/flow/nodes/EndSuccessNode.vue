<template>
  <div class="flow-node flow-node--end-success">
    <Handle type="target" :position="Position.Top" />
    <div class="flow-node__icon bg-green-500">
      <i class="pi pi-check-circle text-white text-xs" />
    </div>
    <span class="flow-node__label">结束（成功）</span>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
</script>
