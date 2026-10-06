// floodText/src/webflow/embed.ts — zero-config browser bundle for Webflow Custom Code Embed.
// Auto-initialises floodText on any element marked with [data-floodtext], reading options from data-*
// attributes; re-runs on container resize, late fonts and elements shown later, sets up elements added
// later, and exposes a small window.FloodText API (init, restart, destroy). Sentiment mode is not
// available here (the embed has no module loader).
import { applyFloodText, startFloodText, removeFloodText } from '../core/adjust'
import type { FloodTextOptions, FloodEffect, WaveShape } from '../core/types'

/** Attribute that opts an element in to the flood-text wave. */
const OPT_IN_ATTR = 'data-floodtext'

/** Per-element teardown record so destroy() can stop the loop and restore markup. */
interface Instance {
	/** Stop function returned by startFloodText */
	stop: () => void
	/** Clean HTML snapshot taken before wrapping, for restoration */
	originalHTML: string
}

/** Tracks live instances keyed by their element — WeakMap so removed nodes are GC'd. */
const INSTANCES = new WeakMap<HTMLElement, Instance>()

/** Elements currently managed, re-run when their container resizes. */
const TRACKED = new Set<HTMLElement>()

/** Valid built-in effect names — used to filter the data-ft-effect list. */
const VALID_EFFECTS: readonly FloodEffect[] = ['wght', 'wdth', 'oblique', 'opacity', 'rotation', 'blur', 'size']

/** Valid wave shapes for data-ft-wave. */
const VALID_WAVES: readonly WaveShape[] = ['sine', 'sawtooth', 'triangle']

/** Valid travel directions for data-ft-direction. */
const VALID_DIRECTIONS: readonly string[] = ['right', 'left', 'diagonal-down', 'diagonal-up']

/**
 * Read floodText options from an element's data-* attributes.
 * Unset attributes fall through to the library defaults.
 *
 * Supported attributes:
 *   data-ft-effect          — comma-separated effect list (e.g. "wght" or "wght,opacity")
 *   data-ft-amplitude       — peak deviation (single-effect only)
 *   data-ft-period          — seconds per wave cycle
 *   data-ft-density         — visible wave cycles across the paragraph
 *   data-ft-direction       — right | left | diagonal-down | diagonal-up
 *   data-ft-wave            — sine | sawtooth | triangle
 *   data-ft-pause-offscreen — "false" to keep animating off-screen
 *
 * @param el - The opted-in element
 */
function readOptions(el: HTMLElement): FloodTextOptions {
	const opts: FloodTextOptions = {}
	const d = el.dataset

	if (d.ftEffect) {
		const effects = d.ftEffect
			.split(',')
			.map((s) => s.trim())
			.filter((s): s is FloodEffect => (VALID_EFFECTS as readonly string[]).includes(s))
		if (effects.length === 1) opts.effect = effects[0]
		else if (effects.length > 1) opts.effect = effects
	}
	if (d.ftAmplitude !== undefined) {
		const n = parseFloat(d.ftAmplitude)
		if (!isNaN(n)) opts.amplitude = n
	}
	if (d.ftPeriod !== undefined) {
		const n = parseFloat(d.ftPeriod)
		if (!isNaN(n)) opts.period = n
	}
	if (d.ftDensity !== undefined) {
		const n = parseFloat(d.ftDensity)
		if (!isNaN(n)) opts.density = n
	}
	if (d.ftDirection && VALID_DIRECTIONS.includes(d.ftDirection)) {
		opts.direction = d.ftDirection as FloodTextOptions['direction']
	}
	if (d.ftWave && (VALID_WAVES as readonly string[]).includes(d.ftWave)) {
		opts.waveShape = d.ftWave as WaveShape
	}
	if (d.ftPauseOffscreen === 'false') {
		opts.pauseOffscreen = false
	}

	return opts
}

/**
 * Re-runs an element when its container's width changes (its locked lines need re-reading), or when the
 * element itself is first shown (hidden in a tab at init).
 */
const widths = new WeakMap<Element, number>()
const resizeObserver = typeof ResizeObserver !== 'undefined'
	? new ResizeObserver((entries) => {
		const rerun = new Set<HTMLElement>()
		for (const entry of entries) {
			const target = entry.target as HTMLElement
			const w = Math.round(entry.contentRect.width)
			const prev = widths.get(target)
			widths.set(target, w)
			if (prev === undefined || prev === w) continue
			if (TRACKED.has(target)) {
				if (prev === 0 && w > 0) rerun.add(target)
			} else {
				TRACKED.forEach((el) => { if (el.parentElement === target) rerun.add(el) })
			}
		}
		rerun.forEach((el) => { if (el.isConnected) initElement(el) })
	})
	: null

/**
 * Initialise a single element: snapshot its markup, wrap characters, start the wave.
 * Idempotent — re-initialising an element restores it first (keeping the original markup).
 *
 * @param el - Element to animate
 */
function initElement(el: HTMLElement): void {
	const previous = INSTANCES.get(el)
	previous?.stop()
	const originalHTML = previous ? previous.originalHTML : el.innerHTML
	const options = readOptions(el)
	const spans = applyFloodText(el, originalHTML, options)
	TRACKED.add(el)
	if (resizeObserver && !widths.has(el)) {
		resizeObserver.observe(el)
		if (el.parentElement) resizeObserver.observe(el.parentElement)
	}
	// An empty result means reduced motion / e-ink / no text — nothing to animate.
	const stop = spans.length > 0 ? startFloodText(spans, options) : () => {}
	INSTANCES.set(el, { stop, originalHTML })
}

/**
 * Stop and restore a single element if it has a live instance.
 *
 * @param el - Element previously initialised
 */
function destroy(el: HTMLElement): void {
	const inst = INSTANCES.get(el)
	if (!inst) return
	inst.stop()
	removeFloodText(el, inst.originalHTML)
	INSTANCES.delete(el)
	TRACKED.delete(el)
	resizeObserver?.unobserve(el)
	widths.delete(el)
}

/**
 * Scan a root for opted-in elements and initialise each one.
 *
 * @param root - Element or document to search (default: document)
 */
function init(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>(`[${OPT_IN_ATTR}]`).forEach(initElement)
}

/** Re-read every tracked element's lines and restart it; elements removed from the page are dropped. */
function restart(): void {
	Array.from(TRACKED).forEach((el) => {
		if (!el.isConnected) { TRACKED.delete(el); INSTANCES.get(el)?.stop(); INSTANCES.delete(el); return }
		initElement(el)
	})
}

// Restart on a viewport width change (not height: mobile toolbars resize the height while scrolling).
let resizeRaf = 0
let lastViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
function onResize(): void {
	if (window.innerWidth === lastViewportWidth) return
	lastViewportWidth = window.innerWidth
	if (resizeRaf) cancelAnimationFrame(resizeRaf)
	resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; restart() })
}

/** Fonts that load later change glyph widths: restart once they settle. */
let fontsRaf = 0
function onFonts(): void {
	if (fontsRaf) cancelAnimationFrame(fontsRaf)
	fontsRaf = requestAnimationFrame(() => { fontsRaf = 0; restart() })
}

/**
 * Auto-initialise once the DOM is parsed and web fonts have loaded.
 * Fonts must settle first: the locked lines and the per-character positions depend on final glyph metrics.
 */
function autoInit(): void {
	const run = () => {
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => init()).catch(() => init())
		} else {
			init()
		}
		window.addEventListener('resize', onResize)
		document.fonts?.addEventListener?.('loadingdone', onFonts)
		// Elements added later (CMS lists, interactions) are set up when they appear.
		if (typeof MutationObserver !== 'undefined' && document.body) {
			new MutationObserver((records) => {
				for (const rec of records) {
					rec.addedNodes.forEach((n) => {
						if (!(n instanceof HTMLElement) || !n.isConnected) return
						const found = n.matches(`[${OPT_IN_ATTR}]`) ? [n] : []
						n.querySelectorAll<HTMLElement>(`[${OPT_IN_ATTR}]`).forEach((el) => found.push(el))
						for (const el of found) if (!INSTANCES.has(el)) initElement(el)
					})
				}
			}).observe(document.body, { childList: true, subtree: true })
		}
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true })
	} else {
		run()
	}
}

autoInit()

// Public browser API — assigned to window.FloodText via the IIFE global name.
export { init, restart, destroy }
