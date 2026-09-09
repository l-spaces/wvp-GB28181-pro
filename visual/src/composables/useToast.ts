import { ref } from 'vue'

const visible = ref(false)
const text = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

export function useToast() {
  function notify(message: string) {
    text.value = message
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      visible.value = false
    }, 1500)
  }

  return { visible, text, notify }
}
