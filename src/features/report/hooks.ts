import { animate, useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

/** True once the element has scrolled into view (and stays true), so charts animate when seen. */
export function useInViewOnce<T extends Element>(margin = '0px 0px -8% 0px') {
  const ref = useRef<T>(null)
  const inView = useInView(ref, { once: true, margin: margin as never })
  return [ref, inView] as const
}

/** Animates a number from 0 to `value` (instantly when the user prefers reduced motion). */
export function useCountUp(value: number, { duration = 1.4, enabled = true }: { duration?: number; enabled?: boolean } = {}) {
  const reduced = useReducedMotion()
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    if (!enabled) return
    if (reduced) {
      setCurrent(value)
      return
    }
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setCurrent })
    return () => controls.stop()
  }, [value, duration, enabled, reduced])
  return current
}
