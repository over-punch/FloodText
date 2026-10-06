// floodText/src/core/adjust.ts — per-character wave: wraps each grapheme in a span (keeping the browser's
// line breaks, the markup and the text), locks the lines, and animates every element from one shared loop.
import { FLOOD_TEXT_CLASSES } from './types'
import type { FloodEffect, FloodProperty, FloodTextOptions, WaveShape } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Neutral base values and default amplitudes per effect type (wght/wdth/oblique bases are the author's own). */
const EFFECT_DEFAULTS: Record<FloodEffect, { base: number; amplitude: number }> = {
	wght:     { base: 400, amplitude: 200  },
	wdth:     { base: 100, amplitude: 20   },
	oblique:  { base: 0,   amplitude: 15   },
	opacity:  { base: 0.7, amplitude: 0.3  },
	rotation: { base: 0,   amplitude: 15   },
	blur:     { base: 0,   amplitude: 2    },
	size:     { base: 1,   amplitude: 0.15 },
}

/** Every built-in effect name, for validating options. */
const VALID_EFFECTS = Object.keys(EFFECT_DEFAULTS) as FloodEffect[]

/** Effects that change the font, which stops the browser shaping neighbouring characters together. */
const FONT_EFFECTS: FloodEffect[] = ['wght', 'wdth', 'oblique', 'size']

/** Defaults for the timing options. */
const DEFAULTS = { period: 4, density: 2, direction: 'diagonal-down', waveShape: 'sine' } as const

/** Shortest wave period in seconds: faster waves flash more than twice a second (WCAG 2.3.1 allows 3). */
const MIN_PERIOD = 0.5

/** Longest frame step the wave advances by, in seconds, so a tab returning from the background doesn't jump. */
const MAX_STEP = 0.1

/** Elements whose text is never wrapped: scripts, styles, form fields, SVG and other replaced content. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'SELECT', 'OPTION', 'CANVAS', 'IFRAME', 'OBJECT', 'VIDEO', 'AUDIO', 'INPUT'])

/** Grapheme segmenter: emoji sequences, combining marks and Indic clusters stay in one span. */
type GraphemeSegmenter = { segment: (text: string) => Iterable<{ segment: string }> }
const graphemeSegmenter: GraphemeSegmenter | null = typeof Intl !== 'undefined' && 'Segmenter' in Intl
	? new (Intl as unknown as { Segmenter: new (locale: undefined, opts: { granularity: 'grapheme' }) => GraphemeSegmenter }).Segmenter(undefined, { granularity: 'grapheme' })
	: null

/** Characters after which a locked line end needs no added hyphen. */
const HYPHEN_LIKE = new Set(['-', '‐', '‑', '‒', '–', '—', '/', '­'])

// ─── Warnings and validation ──────────────────────────────────────────────────

/** Warnings already printed, so a re-run on every resize warns once. */
const warned = new Set<string>()

/** Prints a console warning the first time it is seen. */
function warnOnce(message: string): void {
	if (warned.has(message)) return
	warned.add(message)
	console.warn(message)
}

/** A finite number, or the fallback (with a warning naming the option) when the value is not one. */
function finiteOr(value: unknown, fallback: number, name: string): number {
	if (value === undefined) return fallback
	if (typeof value === 'number' && Number.isFinite(value)) return value
	warnOnce(`[floodText] ${name} must be a finite number; got ${String(value)}, using ${fallback}`)
	return fallback
}

/** Whether the reader asked for reduced motion, or the display can't animate (e-ink). */
function motionOff(): boolean {
	if (typeof window === 'undefined') return true
	return !!(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || window.matchMedia?.('(update: slow)')?.matches)
}

// ─── Sentiment (optional dependency) ──────────────────────────────────────────

type SentimentCtor = new () => { analyze: (text: string) => { score: number } }
let _Sentiment: SentimentCtor | null = null
let _sentimentPromise: Promise<boolean> | null = null

/**
 * Loads the optional `sentiment` package (installed with floodText as an optional dependency, and only
 * loaded for `source: 'sentiment'`). Resolves true once scores are available. applyFloodText starts the
 * load; scores apply from the next call after it resolves — the React hook re-runs for you.
 */
export function loadSentiment(): Promise<boolean> {
	if (_Sentiment) return Promise.resolve(true)
	if (!_sentimentPromise) {
		// @ts-ignore — optional dependency without bundled types
		_sentimentPromise = import('sentiment')
			.then((m) => {
				const mod = m as { default?: SentimentCtor } & SentimentCtor
				_Sentiment = (mod.default ?? mod) as SentimentCtor
				return true
			})
			.catch(() => {
				_sentimentPromise = null
				warnOnce('[floodText] source: "sentiment" needs the `sentiment` package — using "fixed"')
				return false
			})
	}
	return _sentimentPromise
}

// ─── Per-element state ────────────────────────────────────────────────────────

/** One original text node and the nodes that replaced it. */
interface Wrapped {
	original: Text
	produced: Node[]
}

/** What applyFloodText changed on an element, so it can be undone exactly. */
interface ElementState {
	wrapped: Wrapped[]
	/** Inserted line breaks and hyphens */
	inserted: HTMLElement[]
	spans: HTMLElement[]
	/** Kerning and ligature spacing per span (em), restored while the font effects break shaping */
	shapingEm: Float64Array
	/** The element's markup before wrapping (what getCleanHTML returns) */
	cleanHTML: string
	/** Inline styles set on the element to lock the lines, with their earlier values */
	savedStyles: [string, string][]
}

/** Per-element state, keyed by the element passed to applyFloodText. */
const states = new WeakMap<HTMLElement, ElementState>()

/** The element each character span belongs to. */
const ownerOf = new WeakMap<HTMLElement, HTMLElement>()

/** Undo applyFloodText on an element: stop its animation, put the original text nodes back, unlock the lines. */
function restore(element: HTMLElement): void {
	const state = states.get(element)
	if (!state) return
	animationByElement.get(element)?.stop()
	state.inserted.forEach((n) => n.remove())
	for (const w of state.wrapped) {
		const first = w.produced.find((n) => n.parentNode)
		if (first?.parentNode) first.parentNode.insertBefore(w.original, first)
		w.produced.forEach((n) => n.parentNode?.removeChild(n))
	}
	for (const [prop, value] of state.savedStyles) {
		if (value) element.style.setProperty(prop, value)
		else element.style.removeProperty(prop)
	}
	if (!element.getAttribute('style')) element.removeAttribute('style')
	states.delete(element)
}

/**
 * The element's markup without flood-text markup. Exact for an element processed by applyFloodText;
 * for any other element, unwraps .ft-char spans and drops inserted line breaks.
 *
 * @param el - Element that may contain flood-text markup
 */
export function getCleanHTML(el: HTMLElement): string {
	const state = states.get(el)
	if (state) return state.cleanHTML
	const clone = el.cloneNode(true) as HTMLElement
	clone.querySelectorAll(`.${FLOOD_TEXT_CLASSES.br}, .${FLOOD_TEXT_CLASSES.hyphen}`).forEach((n) => n.remove())
	Array.from(clone.querySelectorAll(`.${FLOOD_TEXT_CLASSES.char}`)).reverse().forEach((node) => {
		const parent = node.parentNode
		if (!parent) return
		while (node.firstChild) parent.insertBefore(node.firstChild, node)
		parent.removeChild(node)
	})
	clone.normalize()
	return clone.innerHTML
}

// ─── Wrapping ─────────────────────────────────────────────────────────────────

/**
 * Collect the text nodes under a root via recursive childNodes traversal (not TreeWalker, which skips
 * inline elements in happy-dom), skipping scripts, styles, form fields and SVG.
 */
function collectTextNodes(root: Node, collected: Text[]): void {
	root.childNodes.forEach((child) => {
		if (child.nodeType === Node.TEXT_NODE) {
			collected.push(child as Text)
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement
			if (SKIP_TAGS.has(el.nodeName.toUpperCase()) || el.isContentEditable) return
			collectTextNodes(el, collected)
		}
	})
}

/** Split a word into graphemes (code points when Intl.Segmenter is unavailable). */
function graphemes(text: string): string[] {
	return graphemeSegmenter ? Array.from(graphemeSegmenter.segment(text), (s) => s.segment) : Array.from(text)
}

/** Whether a computed white-space value keeps newlines as line breaks. */
function keepsNewlines(ws: string): boolean {
	return ws.startsWith('pre') || ws === 'break-spaces'
}

/** The next node after `node` and its subtree, in document order, inside `root`. */
function nextAfter(node: Node, root: Node): Node | null {
	let n: Node | null = node
	while (n && n !== root) {
		if (n.nextSibling) return n.nextSibling
		n = n.parentNode
	}
	return null
}

/**
 * How the browser broke the line between two consecutive characters: 'forced' (a <br>, a preserved
 * newline or a block boundary — nothing to lock), or a soft wrap, with whether it hyphenated the word.
 */
function breakKind(a: HTMLElement, b: HTMLElement, root: HTMLElement, style: (el: Element) => CSSStyleDeclaration): 'forced' | 'soft' | 'hyphenated' {
	// Characters in different blocks (paragraphs, list items, or text either side of a block) start
	// their lines anyway.
	const blockOf = (node: HTMLElement) => {
		let el = node.parentElement
		while (el && el !== root && style(el).display.startsWith('inline')) el = el.parentElement
		return el
	}
	if (blockOf(a) !== blockOf(b)) return 'forced'
	let sawSpace = false
	let sawSoftHyphen = false
	let n: Node | null = nextAfter(a, root)
	while (n && n !== b) {
		if (n.nodeType === Node.TEXT_NODE) {
			const text = n.textContent ?? ''
			if (text.includes('\n') && n.parentElement && keepsNewlines(style(n.parentElement).whiteSpace)) return 'forced'
			if (/\s/.test(text.replace(/­/g, ''))) sawSpace = true
			if (text.includes('­')) sawSoftHyphen = true
			n = nextAfter(n, root)
			continue
		}
		if (n.nodeType === Node.ELEMENT_NODE) {
			const el = n as HTMLElement
			if (el.nodeName === 'BR') return 'forced'
			if (el.contains(b)) { n = el.firstChild ?? nextAfter(el, root); continue }
			if (el.classList.contains(FLOOD_TEXT_CLASSES.char)) {
				if ((el.textContent ?? '') === '­') sawSoftHyphen = true
				n = nextAfter(el, root)
				continue
			}
			n = el.firstChild ?? nextAfter(el, root)
			continue
		}
		n = nextAfter(n, root)
	}
	if (n !== b) return 'forced'
	if (sawSpace) return 'soft'
	const last = a.textContent ?? ''
	if (HYPHEN_LIKE.has(last)) return 'soft'
	if (sawSoftHyphen || (b.parentElement && style(b.parentElement).hyphens === 'auto' && /\p{L}$/u.test(last))) return 'hyphenated'
	return 'soft'
}

/**
 * Apply flood-text character wrapping to an element. Each visible grapheme is wrapped in
 * <span class="ft-char">; spaces stay as text, so the browser lays the text out exactly as before.
 * The browser's own line breaks are then locked (a <br class="ft-br"> at each line end, and no wrapping),
 * so the wave can't move words between lines. The text stays in the DOM, so screen readers read it as
 * before. Returns the character spans for startFloodText.
 *
 * Re-applying is safe: the element is restored first. If `originalHTML` differs from the element's
 * current (clean) markup, the element is reset to it.
 *
 * @param element      - Live DOM element (rendered and visible, for the line locking)
 * @param originalHTML - The element's clean markup (from getCleanHTML before the first call)
 * @param options      - FloodTextOptions; source: 'sentiment' starts loading the sentiment package
 */
export function applyFloodText(
	element: HTMLElement,
	originalHTML: string,
	options: FloodTextOptions = {},
): HTMLElement[] {
	if (typeof window === 'undefined' || !element) return []

	// The element's current (wrapped) markup passed back in means "the same content": keep it.
	const wrappedHTML = states.has(element) ? element.innerHTML : null
	restore(element)
	if (typeof originalHTML === 'string' && originalHTML !== wrappedHTML && element.innerHTML !== originalHTML) element.innerHTML = originalHTML

	if (options.source === 'sentiment' && !_Sentiment) {
		void loadSentiment()
		warnOnce('[floodText] sentiment scores load asynchronously — call applyFloodText again once loadSentiment() resolves (the React hook does this for you)')
	}

	// The wave is decorative: under reduced motion (or on e-ink) the element is left untouched.
	if (motionOff()) return []
	if (!element.textContent?.trim()) return []

	// Save scroll position before any DOM mutations — iOS Safari ignores overflow-anchor: none.
	const scrollY = window.scrollY
	const cleanHTML = element.innerHTML

	// --- Pass 1: wrap each grapheme of each word ---
	const analyser = options.source === 'sentiment' && _Sentiment ? new _Sentiment() : null
	const textNodes: Text[] = []
	collectTextNodes(element, textNodes)
	const wrapped: Wrapped[] = []
	const spans: HTMLElement[] = []

	for (const textNode of textNodes) {
		const text = textNode.data
		if (!text || !/\S/.test(text) || !textNode.parentNode) continue
		const produced: Node[] = []
		for (const token of text.split(/(\s+)/)) {
			if (!token) continue
			if (/^\s+$/.test(token)) { produced.push(document.createTextNode(token)); continue }
			const score = analyser ? analyser.analyze(token).score : null
			for (const g of graphemes(token)) {
				const span = document.createElement('span')
				span.className = FLOOD_TEXT_CLASSES.char
				span.textContent = g
				if (score !== null) span.dataset.ftSentiment = String(score)
				ownerOf.set(span, element)
				produced.push(span)
				spans.push(span)
			}
		}
		const fragment = document.createDocumentFragment()
		produced.forEach((n) => fragment.appendChild(n))
		textNode.parentNode.replaceChild(fragment, textNode)
		wrapped.push({ original: textNode, produced })
	}

	const state: ElementState = { wrapped, inserted: [], spans, shapingEm: new Float64Array(spans.length), cleanHTML, savedStyles: [] }
	states.set(element, state)

	// --- Pass 2: read every character's box (one layout) and lock the browser's line breaks ---
	const styleCache = new Map<Element, CSSStyleDeclaration>()
	const style = (el: Element) => {
		let cs = styleCache.get(el)
		if (!cs) { cs = getComputedStyle(el); styleCache.set(el, cs) }
		return cs
	}
	const rects = spans.map((s) => s.getBoundingClientRect())
	const elementStyle = style(element)
	const justified = elementStyle.textAlign === 'justify' || elementStyle.textAlign === 'justify-all'
	const ws = elementStyle.whiteSpace
	// Justified lines would lose their justification at a forced break; pre-line has no no-wrap form.
	const canLock = !justified && ws !== 'pre-line'
	const lineStarts: number[] = []
	if (canLock) {
		let prev = -1
		let lineBottom = -Infinity
		rects.forEach((r, i) => {
			if (r.width === 0 && r.height === 0) return
			const mid = (r.top + r.bottom) / 2
			if (prev >= 0 && mid > lineBottom) {
				lineStarts.push(i)
				lineBottom = r.bottom
			} else {
				lineBottom = Math.max(lineBottom, r.bottom)
			}
			prev = i
		})
	}
	const rendered = rects.some((r) => r.width > 0 || r.height > 0)
	if (canLock && rendered) {
		// Breaks are read before any is inserted; inserting doesn't move the characters.
		const breaks = lineStarts.map((i) => {
			let a = i - 1
			while (a >= 0 && rects[a].width === 0 && rects[a].height === 0) a--
			return { at: spans[i], kind: a >= 0 ? breakKind(spans[a], spans[i], element, style) : 'forced' as const }
		})
		for (const { at, kind } of breaks) {
			if (kind === 'forced' || !at.parentNode) continue
			if (kind === 'hyphenated') {
				const hy = document.createElement('span')
				hy.className = FLOOD_TEXT_CLASSES.hyphen
				hy.setAttribute('aria-hidden', 'true')
				hy.style.userSelect = 'none'
				hy.textContent = '-'
				at.parentNode.insertBefore(hy, at)
				state.inserted.push(hy)
			}
			const br = document.createElement('br')
			br.className = FLOOD_TEXT_CLASSES.br
			at.parentNode.insertBefore(br, at)
			state.inserted.push(br)
		}
		// No wrapping, keeping the author's handling of spaces.
		const lock: [string, string] = typeof CSS !== 'undefined' && CSS.supports?.('text-wrap-mode', 'nowrap')
			? ['text-wrap-mode', 'nowrap']
			: ['white-space', ws.startsWith('pre') || ws === 'break-spaces' ? 'pre' : 'nowrap']
		state.savedStyles.push([lock[0], element.style.getPropertyValue(lock[0])])
		element.style.setProperty(lock[0], lock[1])
	}

	// --- Pass 3: kerning and ligatures. A font effect gives neighbouring characters different fonts, so
	// the browser stops kerning and joining them; measure each character's spacing with and without
	// (one more layout) so startFloodText can keep it. ---
	if (rendered) {
		const kern = element.style.getPropertyValue('font-kerning')
		const liga = element.style.getPropertyValue('font-variant-ligatures')
		const shaped = spans.map((s) => s.getBoundingClientRect().width)
		element.style.setProperty('font-kerning', 'none')
		element.style.setProperty('font-variant-ligatures', 'none')
		const plain = spans.map((s) => s.getBoundingClientRect().width)
		if (kern) element.style.setProperty('font-kerning', kern)
		else element.style.removeProperty('font-kerning')
		if (liga) element.style.setProperty('font-variant-ligatures', liga)
		else element.style.removeProperty('font-variant-ligatures')
		if (!element.getAttribute('style')) element.removeAttribute('style')
		spans.forEach((s, i) => {
			const delta = shaped[i] - plain[i]
			if (Math.abs(delta) < 0.05 || !s.parentElement) return
			// Never shrink a character's box below half its own width (a ligature's later characters).
			const px = Math.max(delta, -plain[i] / 2)
			const size = parseFloat(style(s.parentElement).fontSize) || 16
			state.shapingEm[i] = px / size
		})
	}

	requestAnimationFrame(() => {
		if (Math.abs(window.scrollY - scrollY) > 2) {
			window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior })
		}
	})

	return spans
}

/**
 * Compute a wave sample in the range [-1, 1] for a given phase value.
 * Exported for direct unit testing of wave math.
 *
 * @param phase     - Continuous phase value (fractional part used)
 * @param waveShape - 'sine' | 'sawtooth' | 'triangle'
 */
export function computeWave(
	phase: number,
	waveShape: WaveShape = 'sine',
): number {
	if (waveShape === 'sawtooth') {
		return 2 * ((phase % 1 + 1) % 1) - 1
	}
	if (waveShape === 'triangle') {
		const x = ((phase % 1) + 1) % 1
		return x < 0.5 ? 4 * x - 1 : 3 - 4 * x
	}
	return Math.sin(2 * Math.PI * phase)
}

// ─── Animation ────────────────────────────────────────────────────────────────

/** The author's own font values for the characters inside one parent element. */
interface FontBase {
	/** The author's font-variation-settings without the animated axes, e.g. `"GRAD" 150` */
	otherAxes: string
	wght: number
	wdth: number
	/** Italic text keeps its italic; the oblique effect leaves it alone */
	italic: boolean
	oblique: number
}

/** Parse a computed font-variation-settings value into [tag, value] pairs. */
function parseAxes(fvs: string): [string, number][] {
	if (!fvs || fvs === 'normal') return []
	const out: [string, number][] = []
	for (const m of fvs.matchAll(/["']([^"']{4})["']\s+(-?[\d.]+(?:e[+-]?\d+)?)/gi)) out.push([m[1], parseFloat(m[2])])
	return out
}

/** Read the author's font values for a parent element. */
function fontBase(parent: Element): FontBase {
	const cs = getComputedStyle(parent)
	const axes = parseAxes(cs.getPropertyValue?.('font-variation-settings') ?? cs.fontVariationSettings ?? '')
	const axis = (tag: string) => axes.find(([t]) => t === tag)?.[1]
	const weight = parseFloat(cs.fontWeight)
	const stretch = parseFloat(cs.fontStretch)
	const fontStyle = cs.fontStyle ?? ''
	const obliqueMatch = /oblique\s+(-?[\d.]+)deg/.exec(fontStyle)
	return {
		otherAxes: axes.filter(([t]) => t !== 'wght' && t !== 'wdth').map(([t, v]) => `"${t}" ${v}`).join(', '),
		wght: axis('wght') ?? (Number.isFinite(weight) ? weight : 400),
		wdth: axis('wdth') ?? (Number.isFinite(stretch) ? stretch : 100),
		italic: fontStyle === 'italic',
		oblique: obliqueMatch ? parseFloat(obliqueMatch[1]) : (fontStyle.startsWith('oblique') ? 14 : 0),
	}
}

/** One running animation in the shared loop. */
interface Animation {
	tick: (now: number) => void
	alive: () => boolean
	stop: () => void
	running: boolean
	lastTick: number
}

/** Animations that are running (paused ones are taken out, so a paused page costs nothing). */
const animations = new Set<Animation>()

/** The animation running on each element, for pause/resume/remove. */
const animationByElement = new WeakMap<HTMLElement, Animation>()

/** The animation running on a set of spans, keyed by its first span (for callers without an element). */
const animationBySpan = new WeakMap<HTMLElement, Animation>()

let loopId = 0

/** The single requestAnimationFrame loop shared by every element; stops itself when nothing runs. */
function loop(now: number): void {
	loopId = 0
	animations.forEach((anim) => {
		if (!anim.alive()) { anim.stop(); return }
		anim.tick(now)
	})
	if (animations.size > 0) loopId = requestAnimationFrame(loop)
}

/** Put an animation (back) into the shared loop. */
function addAnimation(anim: Animation): void {
	anim.running = true
	anim.lastTick = performance.now()
	animations.add(anim)
	if (!loopId) loopId = requestAnimationFrame(loop)
}

/** Take an animation out of the shared loop (it keeps its phase). */
function pauseAnimation(anim: Animation): void {
	anim.running = false
	animations.delete(anim)
}

/** The style properties an effect writes on each span. */
const EFFECT_PROPS: Record<FloodEffect, string> = {
	wght: 'font-variation-settings', wdth: 'font-variation-settings', oblique: 'font-style',
	opacity: 'opacity', rotation: 'transform', blur: 'filter', size: 'font-size',
}

/**
 * Start the flood-text animation on the character spans from applyFloodText. Returns a stop function,
 * which also puts every character back at its own style. Every element shares one animation loop;
 * an element removed from the page stops by itself, and starting again on the same spans stops the
 * earlier animation. Under reduced motion (including when the reader turns it on mid-run) nothing runs.
 *
 * wght, wdth and oblique oscillate around the author's own weight, width and slant (italic text keeps
 * its italic), keeping the author's other axes. Note: the `rotation` effect makes characters
 * inline-block, and `size` changes line heights.
 *
 * @param charSpans - Array of .ft-char span elements from applyFloodText
 * @param options   - FloodTextOptions (merged with defaults)
 */
export function startFloodText(
	charSpans: HTMLElement[],
	options: FloodTextOptions = {},
): () => void {
	if (!charSpans || charSpans.length === 0) return () => {}
	if (motionOff()) return () => {}

	// --- Options ---
	const effectInput = options.effect ?? 'wght'
	const requested = (Array.isArray(effectInput) ? effectInput : [effectInput]) as string[]
	let effects = requested.filter((e): e is FloodEffect => (VALID_EFFECTS as string[]).includes(e))
	requested.filter((e) => !(VALID_EFFECTS as string[]).includes(e)).forEach((e) => {
		warnOnce(`[floodText] unknown effect ${JSON.stringify(e)}; valid effects are ${VALID_EFFECTS.join(', ')}`)
	})
	const customProps: FloodProperty[] = (options.properties ?? []).filter((p) =>
		p && typeof p.property === 'string' && Number.isFinite(p.base) && Number.isFinite(p.amplitude))
	if (effects.length === 0 && customProps.length === 0) effects = ['wght']

	const amplitudeMap: Partial<Record<FloodEffect, number>> = {}
	for (const eff of effects) {
		const fallback = EFFECT_DEFAULTS[eff].amplitude
		amplitudeMap[eff] = effects.length === 1 && customProps.length === 0 && options.amplitude !== undefined
			? finiteOr(options.amplitude, fallback, 'amplitude')
			: finiteOr(options.amplitudes?.[eff], fallback, `amplitudes.${eff}`)
	}

	let period = finiteOr(options.period, DEFAULTS.period, 'period')
	if (period <= 0) {
		warnOnce(`[floodText] period must be greater than 0; using ${DEFAULTS.period}`)
		period = DEFAULTS.period
	} else if (period < MIN_PERIOD) {
		warnOnce(`[floodText] period ${period} s would flash more than twice a second; using ${MIN_PERIOD}`)
		period = MIN_PERIOD
	}
	const density = Math.max(0, finiteOr(options.density, DEFAULTS.density, 'density'))
	const direction = (['right', 'left', 'diagonal-down', 'diagonal-up'] as const).includes(options.direction as never)
		? options.direction! : DEFAULTS.direction
	const waveShape: WaveShape = (['sine', 'sawtooth', 'triangle'] as const).includes(options.waveShape as never)
		? options.waveShape! : DEFAULTS.waveShape
	const speed = 1 / period

	const spans = charSpans.slice()
	const element = ownerOf.get(spans[0]) ?? null
	const state = element ? states.get(element) : undefined

	// One animation per element (and per set of spans).
	if (element) animationByElement.get(element)?.stop()
	animationBySpan.get(spans[0])?.stop()

	// --- Per-character amplitude from sentiment scores (the strongest word reaches full amplitude) ---
	let multipliers: number[] | null = null
	if (options.source === 'sentiment') {
		const scores = spans.map((s) => Math.abs(parseFloat(s.dataset.ftSentiment ?? '0')) || 0)
		const maxAbs = Math.max(...scores, 1)
		multipliers = scores.map((abs) => 0.2 + 0.8 * (abs / maxAbs))
	}

	// --- The author's own values, read once per parent element ---
	const bases = new Map<Element, FontBase>()
	const spanBase = spans.map((s) => {
		const parent = s.parentElement ?? s
		let b = bases.get(parent)
		if (!b) { b = fontBase(parent); bases.set(parent, b) }
		return b
	})

	// Font effects (and inline-block rotation) stop the browser shaping neighbours together; keep the
	// kerning and ligature spacing measured by applyFloodText.
	const breaksShaping = effects.some((e) => FONT_EFFECTS.includes(e) || e === 'rotation')
		|| customProps.some((p) => /^(font|letter-spacing|word-spacing)/.test(p.property))
	const shaping = state && state.spans[0] === spans[0] && state.spans.length === spans.length ? state.shapingEm : null

	const written = new Set<string>()
	effects.forEach((e) => written.add(EFFECT_PROPS[e]))
	customProps.forEach((p) => written.add(p.property))

	if (effects.includes('rotation')) spans.forEach((s) => { s.style.display = 'inline-block' })
	if (breaksShaping && shaping) spans.forEach((s, i) => { if (shaping[i]) s.style.marginRight = `${shaping[i].toFixed(4)}em` })

	// --- Positions: read when the element is rendered, and again after it is shown or fonts change ---
	let positions: Float64Array | null = null
	const reversed = direction === 'left' || direction === 'diagonal-up'
	const readPositions = (): boolean => {
		const n = spans.length
		const xs = new Float64Array(n)
		const ys = new Float64Array(n)
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
		let any = false
		for (let i = 0; i < n; i++) {
			const r = spans[i].getBoundingClientRect()
			if (r.width || r.height) any = true
			xs[i] = r.left + r.width / 2
			ys[i] = r.top + r.height / 2
			if (xs[i] < minX) minX = xs[i]
			if (xs[i] > maxX) maxX = xs[i]
			if (ys[i] < minY) minY = ys[i]
			if (ys[i] > maxY) maxY = ys[i]
		}
		if (!any) return false
		const rangeX = maxX - minX || 1
		const rangeY = maxY - minY || 1
		positions = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			const nx = (xs[i] - minX) / rangeX
			const ny = (ys[i] - minY) / rangeY
			positions[i] = direction === 'right' || direction === 'left' ? nx
				: direction === 'diagonal-down' ? (nx + ny) / 2
				: (nx + (1 - ny)) / 2
		}
		return true
	}
	// Measured before the first write, while every character still has its own font.
	readPositions()
	const onFonts = () => { positions = null }
	if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', onFonts)

	let elapsed = 0
	/** Write one frame. */
	const write = () => {
		if (!positions && !readPositions()) return
		const pos = positions!
		for (let i = 0; i < spans.length; i++) {
			const span = spans[i]
			const phase = reversed ? pos[i] * density + elapsed * speed : pos[i] * density - elapsed * speed
			const wave = computeWave(phase, waveShape)
			const m = multipliers ? multipliers[i] : 1
			const base = spanBase[i]
			const axes: string[] = []
			for (const effect of effects) {
				const amp = amplitudeMap[effect]! * m
				switch (effect) {
					case 'wght':
						// Whole units: every distinct value is a separate font instance for the browser.
						axes.push(`"wght" ${Math.round(Math.max(1, Math.min(1000, base.wght + amp * wave)))}`)
						break
					case 'wdth':
						axes.push(`"wdth" ${Math.max(1, Math.min(1000, base.wdth + amp * wave)).toFixed(1)}`)
						break
					case 'oblique':
						if (!base.italic) span.style.fontStyle = `oblique ${Math.max(-90, Math.min(90, base.oblique + amp * wave)).toFixed(2)}deg`
						break
					case 'opacity':
						span.style.opacity = Math.max(0, Math.min(1, EFFECT_DEFAULTS.opacity.base + amp * wave)).toFixed(3)
						break
					case 'rotation':
						span.style.transform = `rotate(${(amp * wave).toFixed(2)}deg)`
						break
					case 'blur':
						span.style.filter = `blur(${Math.max(0, amp * wave).toFixed(2)}px)`
						break
					case 'size':
						span.style.fontSize = `${Math.max(0.1, 1 + amp * wave).toFixed(4)}em`
						break
				}
			}
			if (axes.length) span.style.fontVariationSettings = base.otherAxes ? `${base.otherAxes}, ${axes.join(', ')}` : axes.join(', ')
			for (const prop of customProps) {
				const raw = prop.base + prop.amplitude * m * wave
				const value = prop.clamp ? Math.max(prop.clamp[0], Math.min(prop.clamp[1], raw)) : raw
				span.style.setProperty(prop.property, `${value}${prop.unit ?? ''}`)
			}
		}
	}

	const anim: Animation = {
		running: false,
		lastTick: 0,
		tick: (now) => {
			elapsed += Math.min(MAX_STEP, Math.max(0, (now - anim.lastTick) / 1000))
			anim.lastTick = now
			write()
		},
		alive: () => spans[0].isConnected,
		stop: () => {},
	}

	// Pause while the element is fully off-screen (keeping the phase).
	let io: IntersectionObserver | null = null
	let offscreen = false
	let manuallyPaused = false
	const observed = element ?? spans[0].parentElement
	if (options.pauseOffscreen !== false && observed && typeof IntersectionObserver !== 'undefined') {
		io = new IntersectionObserver((entries) => {
			const entry = entries[entries.length - 1]
			offscreen = !entry.isIntersecting
			if (offscreen) { if (anim.running) pauseAnimation(anim) }
			else if (!anim.running && !manuallyPaused) addAnimation(anim)
		})
		io.observe(observed)
	}

	// Stop (and restore) if the reader turns on reduced motion while it runs.
	const motionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
	const onMotion = () => { if (motionQuery?.matches) anim.stop() }
	motionQuery?.addEventListener?.('change', onMotion)

	let stopped = false
	anim.stop = () => {
		if (stopped) return
		stopped = true
		pauseAnimation(anim)
		io?.disconnect()
		motionQuery?.removeEventListener?.('change', onMotion)
		if (typeof document !== 'undefined') document.fonts?.removeEventListener?.('loadingdone', onFonts)
		if (element && animationByElement.get(element) === anim) animationByElement.delete(element)
		if (animationBySpan.get(spans[0]) === anim) animationBySpan.delete(spans[0])
		pausedControls.delete(anim)
		// Put every character back at its own style.
		spans.forEach((s) => {
			written.forEach((prop) => s.style.removeProperty(prop))
			s.style.removeProperty('display')
			s.style.removeProperty('margin-right')
			if (!s.getAttribute('style')) s.removeAttribute('style')
		})
	}
	pausedControls.set(anim, {
		pause: () => { manuallyPaused = true; if (anim.running) pauseAnimation(anim) },
		resume: () => { manuallyPaused = false; if (!anim.running && !offscreen && !stopped) addAnimation(anim) },
	})

	if (element) animationByElement.set(element, anim)
	animationBySpan.set(spans[0], anim)
	write()
	addAnimation(anim)
	return anim.stop
}

/** Manual pause/resume for each animation (kept apart from the off-screen pause). */
const pausedControls = new WeakMap<Animation, { pause: () => void; resume: () => void }>()

/** The animation for an element passed to applyFloodText (or, for older callers, any element containing its spans). */
function animationFor(el: HTMLElement): Animation | undefined {
	const direct = animationByElement.get(el)
	if (direct) return direct
	const first = el.querySelector<HTMLElement>(`.${FLOOD_TEXT_CLASSES.char}`)
	return first ? animationBySpan.get(first) : undefined
}

/**
 * Pause an active flood-text animation without losing phase. Pass the element passed to applyFloodText.
 *
 * @param el - Element previously processed by applyFloodText
 */
export function pauseFloodText(el: HTMLElement): void {
	const anim = animationFor(el)
	if (anim) pausedControls.get(anim)?.pause()
}

/**
 * Resume a paused flood-text animation, continuing from where it left off.
 * Has no effect if the animation is already running or was never started.
 *
 * @param el - Element previously processed by applyFloodText
 */
export function resumeFloodText(el: HTMLElement): void {
	const anim = animationFor(el)
	if (anim) pausedControls.get(anim)?.resume()
}

/**
 * Stop the animation and restore the element: the original text nodes (and elements, with their
 * listeners) come back and the lines are unlocked. If `originalHTML` is given and differs from the
 * restored markup, the element is reset to it.
 *
 * @param element      - Element previously processed by applyFloodText
 * @param originalHTML - Optional clean HTML snapshot passed to applyFloodText
 */
export function removeFloodText(element: HTMLElement, originalHTML?: string): void {
	if (!element) return
	animationFor(element)?.stop()
	restore(element)
	if (typeof originalHTML === 'string' && element.innerHTML !== originalHTML) element.innerHTML = originalHTML
}
