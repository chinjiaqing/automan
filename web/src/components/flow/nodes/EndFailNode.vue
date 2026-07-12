<template>
  <div class="flow-node flow-node--end-fail">
    <Handle type="target" :position="Position.Top" />
    <div class="flow-node__icon bg-red-500">
      <i class="pi pi-times-circle text-white text-xs" />
    </div>
    <span class="flow-node__label">结束（失败）</span>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
</script>
