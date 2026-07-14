<template>
  <div class="chat-panel">
    <!-- 消息列表 -->
    <div ref="msgContainer" class="chat-panel__messages">
      <div v-if="messages.length === 0" class="chat-panel__empty">
        <i class="pi pi-comments text-4xl text-gray-300 mb-2" />
        <p class="text-sm text-gray-400">发送消息开始 AI 编排</p>
        <p class="text-xs text-gray-300 mt-1">描述你想要的自动化流程</p>
      </div>
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        class="chat-panel__msg"
        :class="`chat-panel__msg--${msg.role}`"
      >
        <div class="chat-panel__msg-avatar">
          <i :class="`pi ${msg.role === 'user' ? 'pi-user' : 'pi-bolt'}`" />
        </div>
        <div class="chat-panel__msg-body">
          <pre class="chat-panel__msg-text">{{ msg.content }}<span v-if="msg.streaming" class="chat-panel__cursor">▊</span></pre>
        </div>
      </div>
      <div v-if="isStreaming && messages.length > 0 && messages[messages.length - 1].content === ''" class="chat-panel__typing">
        <span class="chat-panel__dot" />
        <span class="chat-panel__dot" />
        <span class="chat-panel__dot" />
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="chat-panel__error">
      <i class="pi pi-exclamation-triangle mr-1" />
      {{ error }}
    </div>

    <!-- 输入区域 -->
    <div class="chat-panel__input">
      <Textarea
        v-model="inputText"
        :placeholder="isConfigured ? '描述你的需求，如：打开微信搜索联系人发送消息' : '请先配置 LLM API (右上角设置)'"
        :disabled="isStreaming || !isConfigured"
        rows="2"
        autoResize
        @keydown.enter.ctrl="handleSend"
        @keydown.enter.meta="handleSend"
        class="chat-panel__textarea"
      />
      <Button
        icon="pi pi-send"
        :disabled="!inputText.trim() || isStreaming || !isConfigured"
        size="small"
        @click="handleSend"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import type { ChatMessage } from '../composables/useAiChat.js'

const props = defineProps<{
  messages: ChatMessage[]
  isStreaming: boolean
  error: string
  isConfigured: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
}>()

const inputText = ref('')
const msgContainer = ref<HTMLElement>()

function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value) {
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight
    }
  })
}

// 消息变化时自动滚动
watch(() => props.messages.length, scrollToBottom)
watch(
  () => props.messages.map((m) => m.content),
  scrollToBottom,
  { deep: true },
)

function handleSend() {
  const text = inputText.value.trim()
  if (!text || props.isStreaming || !props.isConfigured) return
  inputText.value = ''
  emit('send', text)
}
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f9fafb;
}

.chat-panel__messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-panel__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.chat-panel__msg {
  display: flex;
  gap: 8px;
  max-width: 100%;
}

.chat-panel__msg--user {
  flex-direction: row-reverse;
}

.chat-panel__msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
}

.chat-panel__msg--user .chat-panel__msg-avatar {
  background: #dbeafe;
  color: #2563eb;
}

.chat-panel__msg--assistant .chat-panel__msg-avatar {
  background: #fef3c7;
  color: #d97706;
}

.chat-panel__msg-body {
  max-width: calc(100% - 44px);
  min-width: 0;
}

.chat-panel__msg--user .chat-panel__msg-body {
  background: #2563eb;
  color: white;
  border-radius: 12px 12px 2px 12px;
  padding: 8px 12px;
}

.chat-panel__msg--assistant .chat-panel__msg-body {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px 12px 12px 2px;
  padding: 8px 12px;
}

.chat-panel__msg-text {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-panel__cursor {
  animation: blink 0.8s infinite;
  color: #2563eb;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.chat-panel__typing {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  align-items: center;
}

.chat-panel__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9ca3af;
  animation: bounce 1.2s infinite;
}

.chat-panel__dot:nth-child(2) { animation-delay: 0.2s; }
.chat-panel__dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

.chat-panel__error {
  margin: 0 16px;
  padding: 6px 12px;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  align-items: center;
}

.chat-panel__input {
  padding: 12px;
  border-top: 1px solid #e5e7eb;
  background: white;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.chat-panel__textarea {
  flex: 1;
  resize: none !important;
  font-size: 13px;
  max-height: 200px;
  overflow-y: auto !important;
}
</style>
