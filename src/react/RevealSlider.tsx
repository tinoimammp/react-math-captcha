'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drag-to-reveal slider used to gate challenge issuance behind a user
 * interaction. The component is purely presentational: it fires `onComplete`
 * once the user drags past the threshold (or activates via keyboard).
 *
 * Design notes:
 *   - Pointer Events API unifies mouse/touch/pen.
 *   - `touch-action: pan-y` lets vertical page scroll pass through, so the
 *     slider only captures horizontal gestures.
 *   - Spring-back below the threshold uses a CSS transition (no physics lib).
 *   - Keyboard: Space / Enter / End / ArrowRight all instant-complete for
 *     a11y. Tab focus is preserved.
 *   - Once completed, the slider is permanently locked in the "done" state;
 *     the parent owns reset by unmounting/remounting.
 */

const COMPLETE_THRESHOLD = 0.9 // 90% of track width

export interface RevealSliderProps {
  onComplete: () => void
  disabled?: boolean
  label?: string
}

export function RevealSlider({
  onComplete,
  disabled = false,
  label = 'Slide to reveal challenge',
}: RevealSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  // The fill trail — a coloured bar that grows leftwards-to-rightwards as
  // the knob moves, giving the user immediate visual feedback that their
  // drag is being registered. Updated imperatively (same as the knob) so
  // it stays in lockstep with pointer movement at 60fps; React re-renders
  // would trail behind on slower devices.
  const fillRef = useRef<HTMLDivElement>(null)

  // Drag state lives in refs to avoid re-rendering on every pointer move.
  // The DOM is updated imperatively through `transform` for 60fps drag.
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const offsetRef = useRef(0)
  const maxOffsetRef = useRef(0)
  const pointerIdRef = useRef<number | null>(null)

  const [completed, setCompleted] = useState(false)
  const [dragging, setDragging] = useState(false)

  const finish = useCallback(() => {
    if (completed) return
    setCompleted(true)
    setDragging(false)
    // Snap the knob and the fill to the end visually. Using the same
    // transition curve on both keeps them locked together — otherwise the
    // knob's snap could outrun the fill and the user would see a gap.
    if (knobRef.current && maxOffsetRef.current > 0) {
      knobRef.current.style.transition = 'transform 0.18s ease-out'
      knobRef.current.style.transform = `translateX(${maxOffsetRef.current}px)`
    }
    if (fillRef.current) {
      fillRef.current.style.transition = 'width 0.18s ease-out'
      fillRef.current.style.width = '100%'
    }
    onComplete()
  }, [completed, onComplete])

  const springBack = useCallback(() => {
    if (knobRef.current) {
      knobRef.current.style.transition = 'transform 0.2s ease-out'
      knobRef.current.style.transform = 'translateX(0px)'
    }
    // Spring the fill back too, with a matching curve so the trail visibly
    // "retracts" with the knob — reinforcing that the drag was abandoned.
    if (fillRef.current) {
      fillRef.current.style.transition = 'width 0.2s ease-out'
      fillRef.current.style.width = '0px'
    }
    offsetRef.current = 0
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || completed) return
      if (!trackRef.current || !knobRef.current) return

      // Compute usable drag range = track width − knob width − 2× horizontal padding.
      const trackRect = trackRef.current.getBoundingClientRect()
      const knobRect = knobRef.current.getBoundingClientRect()
      maxOffsetRef.current = Math.max(0, trackRect.width - knobRect.width - 8) // 4px each side

      draggingRef.current = true
      startXRef.current = e.clientX
      offsetRef.current = 0
      pointerIdRef.current = e.pointerId
      knobRef.current.setPointerCapture(e.pointerId)
      // Kill the spring-back transition on both elements so the drag feels
      // 1:1 with the pointer, not laggy.
      knobRef.current.style.transition = 'none'
      if (fillRef.current) fillRef.current.style.transition = 'none'
      setDragging(true)
    },
    [disabled, completed],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !knobRef.current) return
      const dx = e.clientX - startXRef.current
      const clamped = Math.max(0, Math.min(maxOffsetRef.current, dx))
      offsetRef.current = clamped
      knobRef.current.style.transform = `translateX(${clamped}px)`
      // Grow the fill so its right edge aligns with the centre of the knob.
      // Knob is 44px wide and starts at left:4px, so the centre lives at
      // `4 + 22 + clamped` px from the track's left edge.
      if (fillRef.current) {
        fillRef.current.style.width = `${clamped + 26}px`
      }

      if (
        maxOffsetRef.current > 0 &&
        clamped / maxOffsetRef.current >= COMPLETE_THRESHOLD
      ) {
        // Threshold crossed — release pointer & fire onComplete.
        try {
          if (pointerIdRef.current !== null) {
            knobRef.current.releasePointerCapture(pointerIdRef.current)
          }
        } catch {
          /* ignore — pointer may already be released */
        }
        draggingRef.current = false
        pointerIdRef.current = null
        finish()
      }
    },
    [finish],
  )

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    pointerIdRef.current = null
    setDragging(false)
    if (!completed) springBack()
  }, [completed, springBack])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || completed) return
      if (
        e.key === ' ' ||
        e.key === 'Enter' ||
        e.key === 'End' ||
        e.key === 'ArrowRight'
      ) {
        e.preventDefault()
        // Compute max offset on demand — keyboard activation may happen
        // before any pointer interaction populates the ref.
        if (trackRef.current && knobRef.current) {
          const trackRect = trackRef.current.getBoundingClientRect()
          const knobRect = knobRef.current.getBoundingClientRect()
          maxOffsetRef.current = Math.max(0, trackRect.width - knobRect.width - 8)
        }
        finish()
      }
    },
    [disabled, completed, finish],
  )

  // Cleanup: if the component unmounts mid-drag, release pointer capture.
  useEffect(() => {
    return () => {
      const knob = knobRef.current
      const pid = pointerIdRef.current
      if (knob && pid !== null) {
        try { knob.releasePointerCapture(pid) } catch { /* noop */ }
      }
    }
  }, [])

  const progress = (() => {
    if (completed) return 1
    if (maxOffsetRef.current <= 0) return 0
    return Math.min(1, offsetRef.current / maxOffsetRef.current)
  })()

  return (
    <div
      ref={trackRef}
      className="rmc-slider-track"
      data-state={completed ? 'completed' : dragging ? 'dragging' : 'idle'}
      data-disabled={String(disabled)}
    >
      {/* Fill trail — sits behind the label & knob, grows with the drag. */}
      <div ref={fillRef} className="rmc-slider-fill" aria-hidden="true" />
      <span className="rmc-slider-label" aria-hidden="true">
        {completed ? 'Revealed' : label}
      </span>
      <div
        ref={knobRef}
        className="rmc-slider-knob"
        role="slider"
        tabIndex={disabled || completed ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-disabled={disabled || completed}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {completed ? (
          <CheckMark />
        ) : (
          <ChevronRight />
        )}
      </div>
    </div>
  )
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polyline
        points="9,5 16,12 9,19"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polyline
        points="5,13 10,18 19,7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}