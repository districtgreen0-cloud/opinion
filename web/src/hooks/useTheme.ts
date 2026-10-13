import { useEffect } from 'react'
import { useStore } from '../store'

/** Resolves dark / light / system → <html data-theme>, and follows the OS while on "system". */
export function useTheme() {
  const pref = useStore((s) => s.themePref)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const ui = pref === 'system' ? (mq.matches ? 'light' : 'dark') : pref
      const root = document.documentElement
      root.dataset.theme = ui
      root.style.colorScheme = ui
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ui === 'light' ? '#f4f5f8' : '#000000')
      useStore.getState().setUi(ui)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])
}
