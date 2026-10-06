// floodText/src/react/useFloodText.ts — React hook: wraps the element's characters and runs the wave;
// re-runs on container width changes, after fonts (or sentiment scores) load, and when options change.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { applyFloodText, getCleanHTML, loadSentiment, startFloodText } from '../core/adjust'
import type { FloodTextOptions } from '../core/types'

/**
 * React hook that applies the flood-text per-character wave to a ref'd element.
 * Respects `prefers-reduced-motion` (the element is left untouched). Stops on unmount.
 *
 * @param options    - FloodTextOptions controlling effect, amplitude, period, density, etc.
 * @param contentKey - A value that changes when the element's content changes (FloodText derives one from
 *                     its children). The library rewrites the element's text nodes, so new content needs
 *                     a fresh element and a fresh snapshot.
 * @returns A ref to attach to the target HTMLElement
 */
export function useFloodText(options: FloodTextOptions = {}, contentKey?: string) {
	const ref = useRef<HTMLElement>(null)
	const originalHTMLRef = useRef<string | null>(null)
	/** The element originalHTMLRef was read from; a new element is read afresh. */
	const sourceElRef = useRef<HTMLElement | null>(null)
	const stopRef = useRef<(() => void) | null>(null)
	const optionsRef = useRef(options)
	optionsRef.current = options

	// Every option is a dependency (serialised, so an inline object doesn't re-run every render).
	const optionsKey = JSON.stringify(options)

	const run = useCallback(() => {
		const el = ref.current
		if (!el) return
		if (originalHTMLRef.current === null || sourceElRef.current !== el) {
			originalHTMLRef.current = getCleanHTML(el)
			sourceElRef.current = el
		}
		stopRef.current?.()
		stopRef.current = null
		const spans = applyFloodText(el, originalHTMLRef.current, optionsRef.current)
		if (spans.length > 0) stopRef.current = startFloodText(spans, optionsRef.current)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [optionsKey, contentKey])

	useLayoutEffect(() => {
		run()
		const el = ref.current
		if (!el || typeof ResizeObserver === 'undefined') return
		// Watch the container, not the element: a shrink-wrapped element changes width with the wave.
		const target = el.parentElement ?? el
		let lastWidth = Math.round(target.getBoundingClientRect().width)
		let rafId = 0
		const ro = new ResizeObserver((entries) => {
			if (!entries.length) return
			const w = Math.round(entries[0].contentRect.width)
			if (w === lastWidth) return
			lastWidth = w
			cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(run)
		})
		ro.observe(target)
		return () => {
			stopRef.current?.()
			stopRef.current = null
			ro.disconnect()
			cancelAnimationFrame(rafId)
		}
	}, [run])

	// Re-run once fonts finish loading (not when they already have), and once sentiment scores arrive.
	useEffect(() => {
		let mounted = true
		if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') {
			document.fonts.ready.then(() => { if (mounted) run() }).catch(() => {})
		}
		if (optionsRef.current.source === 'sentiment') {
			loadSentiment().then((ok) => { if (ok && mounted) run() }).catch(() => {})
		}
		return () => { mounted = false }
	}, [run])

	return ref
}
