import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})
