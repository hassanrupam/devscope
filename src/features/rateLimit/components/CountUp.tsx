import { animate, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

/** Number that eases to its new value. Honors reduced motion. */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en') }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(reduce ? value : 0)
  useEffect(() => {
    if (reduce) {
      setShown(value)
      return
    }
    const controls = animate(from.current, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { from.current = v; setShown(v) } })
    return () => controls.stop()
  }, [value, reduce])
  return <>{format(shown)}</>
}
