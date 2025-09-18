import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Lightweight flip/replace animation for the latest action line.
// Uses Web Animations via the browser; no external deps required.
export const StreamingAction: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const [display, setDisplay] = useState(text)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (display === text) return
    const el = ref.current
    if (!el) { setDisplay(text); return }

    // Animate out the current line
    const out = el.animate(
      [
        { transform: 'perspective(600px) rotateX(0deg)', opacity: 1 },
        { transform: 'perspective(600px) rotateX(90deg)', opacity: 0 }
      ],
      { duration: 220, easing: 'ease-in' }
    )
    out.onfinish = () => {
      setDisplay(text)
      // Next tick, animate in the new line
      requestAnimationFrame(() => {
        const el2 = ref.current
        if (!el2) return
        el2.animate(
          [
            { transform: 'perspective(600px) rotateX(-90deg)', opacity: 0 },
            { transform: 'perspective(600px) rotateX(0deg)', opacity: 1 }
          ],
          { duration: 260, easing: 'ease-out' }
        )
      })
    }
  }, [text, display])

  if (!display) return null
  return (
    <div ref={ref} className={cn('mt-2 text-[13px] text-gray-600 dark:text-gray-300 origin-top', className)}>
      <span className="shimmer-text">{display}</span>
    </div>
  )
}

export default StreamingAction

