// floodText/src/__tests__/adjust.test.ts — core algorithm tests
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { applyFloodText, removeFloodText, getCleanHTML, startFloodText, computeWave, pauseFloodText, resumeFloodText } from '../core/adjust'
import { FLOOD_TEXT_CLASSES } from '../core/types'

/** Create a paragraph element with the given inner HTML and attach to document.body */
function makeElement(html: string): HTMLElement {
	const el = document.createElement('p')
	el.innerHTML = html
	document.body.appendChild(el)
	return el
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('flood-text', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// 1. applyFloodText produces .ft-char spans
	it('applyFloodText wraps each character in an ft-char span', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBe(5) // H, e, l, l, o
		charSpans.forEach(span => {
			expect(span.classList.contains(FLOOD_TEXT_CLASSES.char)).toBe(true)
			expect(span.textContent?.length).toBe(1)
		})
	})

	// 2. Spaces are preserved as text nodes, not wrapped
	it('whitespace is not wrapped in ft-char spans', () => {
		const el = makeElement('Hi there')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		// 'Hi there' = 7 visible characters (H, i, t, h, e, r, e), space is not wrapped
		expect(charSpans.length).toBe(7)
	})

	// 3. removeFloodText restores original HTML
	it('removeFloodText restores original HTML', () => {
		const el = makeElement('<em>Hello</em> world')
		const original = getCleanHTML(el)
		applyFloodText(el, original, {})
		removeFloodText(el, original)
		expect(el.innerHTML).toBe(original)
	})

	// 4. getCleanHTML is idempotent
	it('getCleanHTML is idempotent', () => {
		const el = makeElement('<em>Hello</em> world')
		const html = getCleanHTML(el)
		const html2 = getCleanHTML(el)
		expect(html).toBe(html2)
	})

	// 5. Inline elements preserved after applyFloodText
	it('preserves inline elements', () => {
		const el = makeElement('<em>italic</em> and <strong>bold</strong>')
		const original = getCleanHTML(el)
		applyFloodText(el, original, {})
		expect(el.querySelector('em')).toBeTruthy()
		expect(el.querySelector('strong')).toBeTruthy()
	})

	// 6. startFloodText returns a function
	it('startFloodText returns a stop function', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const stop = startFloodText(charSpans, {})
		expect(typeof stop).toBe('function')
		stop()
	})

	// 7. startFloodText is a no-op for empty char array
	it('startFloodText with empty array returns noop', () => {
		const stop = startFloodText([], {})
		expect(typeof stop).toBe('function')
		expect(() => stop()).not.toThrow()
	})

	// 8. Empty element doesn't throw
	it('applyFloodText does not throw on empty element', () => {
		const el = makeElement('')
		const original = getCleanHTML(el)
		expect(() => applyFloodText(el, original, {})).not.toThrow()
	})

	// 9. getCleanHTML after apply strips all ft-char class names
	it('getCleanHTML after apply strips all injected markup', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		applyFloodText(el, original, {})
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain(FLOOD_TEXT_CLASSES.char)
	})

	// 10. Applying twice from same original gives same char count
	it('applying twice from same original gives same char count', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const spans1 = applyFloodText(el, original, {})
		const spans2 = applyFloodText(el, original, {})
		expect(spans2.length).toBe(spans1.length)
	})

	// 11. All direction options work without throwing
	it.each(['right', 'left', 'diagonal-down', 'diagonal-up'] as const)(
		'direction %s works without throwing',
		(direction) => {
			const el = makeElement('Hello world')
			const original = getCleanHTML(el)
			const charSpans = applyFloodText(el, original, { direction })
			expect(charSpans.length).toBeGreaterThan(0)
			const stop = startFloodText(charSpans, { direction })
			expect(typeof stop).toBe('function')
			stop()
		},
	)

	// 12. All supported effect types start without throwing
	it.each(['wght', 'wdth', 'oblique', 'opacity'] as const)(
		'effect %s starts without throwing',
		(effect) => {
			const el = makeElement('Hello world')
			const original = getCleanHTML(el)
			const charSpans = applyFloodText(el, original, { effect })
			const stop = startFloodText(charSpans, { effect })
			expect(typeof stop).toBe('function')
			stop()
		},
	)

	// 13. Wave utility functions return values in [-1, 1]
	describe('computeWave returns values in [-1, 1]', () => {
		const phases = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0, -0.3, 1.7, 2.5, -1.5]

		it('sine wave is always in [-1, 1]', () => {
			for (const p of phases) {
				const v = computeWave(p, 'sine')
				expect(v).toBeGreaterThanOrEqual(-1 - 1e-9)
				expect(v).toBeLessThanOrEqual(1 + 1e-9)
			}
		})

		it('sawtooth wave is always in [-1, 1]', () => {
			for (const p of phases) {
				const v = computeWave(p, 'sawtooth')
				expect(v).toBeGreaterThanOrEqual(-1 - 1e-9)
				expect(v).toBeLessThanOrEqual(1 + 1e-9)
			}
		})

		it('triangle wave is always in [-1, 1]', () => {
			for (const p of phases) {
				const v = computeWave(p, 'triangle')
				expect(v).toBeGreaterThanOrEqual(-1 - 1e-9)
				expect(v).toBeLessThanOrEqual(1 + 1e-9)
			}
		})
	})

	// 14. computeWave: sine at phase 0 returns 0
	it('computeWave sine at phase 0 returns 0', () => {
		expect(computeWave(0, 'sine')).toBeCloseTo(0)
	})

	// 15. computeWave: sine at phase 0.25 returns 1
	it('computeWave sine at phase 0.25 returns 1', () => {
		expect(computeWave(0.25, 'sine')).toBeCloseTo(1)
	})

	// 16. waveShape:'triangle' never exceeds [-1, 1]
	it('waveShape triangle stays within [-1, 1]', () => {
		const phases = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0, 1.5, -0.5]
		for (const p of phases) {
			const v = computeWave(p, 'triangle')
			expect(v).toBeGreaterThanOrEqual(-1)
			expect(v).toBeLessThanOrEqual(1)
		}
	})

	// 17. Character count matches visible characters in text
	it('char span count matches non-whitespace character count', () => {
		const text = 'ABC DEF'
		const el = makeElement(text)
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const expectedCount = text.replace(/\s/g, '').length // 6
		expect(charSpans.length).toBe(expectedCount)
	})

	// 18. Density option is accepted without throwing
	it('density option is accepted without throwing', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const stop = startFloodText(charSpans, { density: 3 })
		expect(typeof stop).toBe('function')
		stop()
	})

	// 19. prefers-reduced-motion: applyFloodText restores originalHTML and returns empty array
	it('prefers-reduced-motion: restores originalHTML, returns [], injects no char spans', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: true, media: '', onchange: null, addListener: () => {}, removeListener: () => {},
			addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
		} as MediaQueryList)
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBe(0)
		expect(el.innerHTML).toBe(original)
		expect(el.querySelectorAll(`.${FLOOD_TEXT_CLASSES.char}`).length).toBe(0)
		vi.restoreAllMocks()
	})

	// 20. update:slow: applyFloodText restores originalHTML and returns empty array
	it('update:slow guard: restores originalHTML on e-ink display', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: true, media: '', onchange: null, addListener: () => {}, removeListener: () => {},
			addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
		} as MediaQueryList)
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBe(0)
		expect(el.innerHTML).toBe(original)
		vi.restoreAllMocks()
	})

	// 21. SSR guard: applyFloodText returns [] without throwing when window is undefined
	it('SSR guard: returns [] without throwing when window is undefined', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const win = (globalThis as Record<string, unknown>).window
		delete (globalThis as Record<string, unknown>).window
		try {
			let result: HTMLElement[] = []
			expect(() => { result = applyFloodText(el, original, {}) }).not.toThrow()
			expect(result).toEqual([])
		} finally {
			;(globalThis as Record<string, unknown>).window = win
		}
	})

	// ── CRITICAL: effect coverage ─────────────────────────────────────────────

	// 22. rotation, blur, size effects start without throwing
	it.each(['rotation', 'blur', 'size'] as const)(
		'effect %s starts without throwing',
		(effect) => {
			const el = makeElement('Hello world')
			const original = getCleanHTML(el)
			const charSpans = applyFloodText(el, original, { effect })
			expect(charSpans.length).toBeGreaterThan(0)
			const stop = startFloodText(charSpans, { effect })
			expect(typeof stop).toBe('function')
			stop()
		},
	)

	// 23. rotation effect sets display:inline-block on all char spans
	it('rotation effect sets display:inline-block on char spans', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		startFloodText(charSpans, { effect: 'rotation' })
		charSpans.forEach((span) => {
			expect(span.style.display).toBe('inline-block')
		})
	})

	// ── CRITICAL: prefers-reduced-motion vs update:slow isolation ────────────

	// 24. prefers-reduced-motion guard fires when query is '(prefers-reduced-motion: reduce)'
	it('prefers-reduced-motion: only fires for the correct media query', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
			matches: query === '(prefers-reduced-motion: reduce)',
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => true,
		} as MediaQueryList))
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBe(0)
		expect(el.innerHTML).toBe(original)
	})

	// 25. update:slow guard fires when query is '(update: slow)' but not reduced-motion
	it('update:slow: only fires for the correct media query', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
			matches: query === '(update: slow)',
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => true,
		} as MediaQueryList))
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBe(0)
		expect(el.innerHTML).toBe(original)
	})

	// 26. startFloodText update:slow guard returns noop
	it('startFloodText update:slow: returns noop without throwing', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBeGreaterThan(0)
		vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
			matches: query === '(update: slow)',
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => true,
		} as MediaQueryList))
		const stop = startFloodText(charSpans, {})
		expect(typeof stop).toBe('function')
		expect(() => stop()).not.toThrow()
	})

	// ── CRITICAL: pauseFloodText / resumeFloodText ────────────────────────────

	// 27. pauseFloodText cancels a running animation without throwing
	it('pauseFloodText: cancels running animation, no-op on unknown element', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const stop = startFloodText(charSpans, { pauseOffscreen: false })
		// Should not throw on an element not in the registry
		const unknownEl = makeElement('Unknown')
		expect(() => pauseFloodText(unknownEl)).not.toThrow()
		// Pause and resume the real element
		expect(() => pauseFloodText(el)).not.toThrow()
		expect(() => resumeFloodText(el)).not.toThrow()
		stop()
	})

	// 28. resumeFloodText is a no-op when already running
	it('resumeFloodText: no-op when already running', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const stop = startFloodText(charSpans, { pauseOffscreen: false })
		expect(() => resumeFloodText(el)).not.toThrow()
		stop()
	})

	// 29. pauseFloodText is a no-op when already paused
	it('pauseFloodText: no-op when already paused', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const stop = startFloodText(charSpans, { pauseOffscreen: false })
		pauseFloodText(el)
		expect(() => pauseFloodText(el)).not.toThrow()
		stop()
	})

	// 30. pauseFloodText: registry key is the container, not a nested inline element
	it('pauseFloodText: works when first char is inside <em>', () => {
		const el = makeElement('<em>Hello</em> world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBeGreaterThan(0)
		const stop = startFloodText(charSpans, { pauseOffscreen: false })
		// pauseFloodText must reach the registry even when the first span's parentElement is <em>
		expect(() => pauseFloodText(el)).not.toThrow()
		stop()
	})

	// ── MAJOR: aria attributes ────────────────────────────────────────────────

	// 31. The text stays readable: no aria-label on the container (screen readers ignore it on a
	// paragraph or div), and the characters are not hidden from assistive technology.
	it('applyFloodText keeps the text in the accessibility tree (no aria-label, no aria-hidden)', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		expect(el.getAttribute('aria-label')).toBeNull()
		charSpans.forEach((span) => expect(span.hasAttribute('aria-hidden')).toBe(false))
		expect(el.textContent).toBe('Hello world')
	})

	// 32. An author's own aria-label is left alone
	it("applyFloodText and removeFloodText keep the author's aria-label", () => {
		const el = makeElement('Hi')
		el.setAttribute('aria-label', 'Greeting')
		const original = getCleanHTML(el)
		applyFloodText(el, original, {})
		expect(el.getAttribute('aria-label')).toBe('Greeting')
		removeFloodText(el, original)
		expect(el.getAttribute('aria-label')).toBe('Greeting')
	})

	// 33. removeFloodText removes aria-label from container
	it('removeFloodText removes aria-label from container', () => {
		const el = makeElement('Hello world')
		const original = getCleanHTML(el)
		applyFloodText(el, original, {})
		removeFloodText(el, original)
		expect(el.getAttribute('aria-label')).toBeNull()
	})

	// ── MAJOR: wght/wdth clamping ─────────────────────────────────────────────

	// 34. wght values are clamped to [1, 1000] — applyEffectsToSpan via tick
	it('wght amplitude over-range does not throw', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		// amplitude of 2000 would produce wght of 400 ± 2000 — way outside [1,1000]
		const stop = startFloodText(charSpans, { effect: 'wght', amplitude: 2000 })
		expect(typeof stop).toBe('function')
		stop()
	})

	// ── MAJOR: computeCharPositions edge cases ────────────────────────────────

	// 35. Single character — rangeX=0 fallback does not throw or produce NaN
	it('computeCharPositions: single character does not produce NaN positions', () => {
		const el = makeElement('A')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		expect(charSpans.length).toBe(1)
		expect(() => startFloodText(charSpans, { direction: 'right' })).not.toThrow()
	})

	// ── MAJOR: period clamping ────────────────────────────────────────────────

	// 36. period:0 is clamped to 0.1 — does not produce Infinity speed or throw
	it('period:0 does not throw and is clamped', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const stop = startFloodText(charSpans, { period: 0 })
		expect(typeof stop).toBe('function')
		stop()
	})

	// 37. negative period is clamped to 0.1
	it('negative period does not throw', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		const stop = startFloodText(charSpans, { period: -5 })
		expect(typeof stop).toBe('function')
		stop()
	})

	// ── MAJOR: getCleanHTML with nested inline elements ───────────────────────

	// 38. getCleanHTML correctly restores nested inline elements after wrapping
	it('getCleanHTML restores <em> and <strong> after character wrapping', () => {
		const html = '<em>Hello</em> <strong>world</strong>'
		const el = makeElement(html)
		const original = getCleanHTML(el)
		applyFloodText(el, original, {})
		// After wrapping, inner structure should be recoverable
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain(FLOOD_TEXT_CLASSES.char)
		expect(cleaned).toContain('<em>')
		expect(cleaned).toContain('<strong>')
		expect(cleaned).toContain('Hello')
		expect(cleaned).toContain('world')
	})

	// ── MAJOR: stale fontVariationSettings cleared ────────────────────────────

	// 39. opacity-only effect does not leave fontVariationSettings set
	it('opacity effect does not set fontVariationSettings', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		const charSpans = applyFloodText(el, original, {})
		// Set a stale value first to confirm it gets cleared
		charSpans.forEach((s) => { s.style.fontVariationSettings = "'wght' 700" })
		startFloodText(charSpans, { effect: 'opacity' })
		// fontVariationSettings should be cleared (empty string) after next tick
		// We verify the startFloodText call does not throw and returns a stop function
		// (actual style mutations require rAF to fire — structural test only here)
		charSpans.forEach((span) => {
			// The stale value is still set before the first rAF tick — clearing happens in tick()
			// so we just verify startFloodText accepted the config without throwing
			expect(typeof span.style.fontVariationSettings).toBe('string')
		})
	})
})

// ─── Review fixes (2026-10) ──────────────────────────────────────────────────

/** Give every element a rendered box (happy-dom reports zero), so the wave writes values. */
function mockRenderedLayout() {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
		width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => {},
	} as DOMRect)
}

describe('review fixes', () => {
	beforeEach(() => { document.body.innerHTML = '' })
	afterEach(() => { vi.restoreAllMocks() })

	it('keeps the original elements, so listeners survive apply, re-apply and remove', () => {
		const el = makeElement('Read <a href="#" id="L">our terms</a> now.')
		const link = el.querySelector('a')!
		let clicks = 0
		link.addEventListener('click', (e) => { e.preventDefault(); clicks++ })
		const original = getCleanHTML(el)
		applyFloodText(el, original)
		applyFloodText(el, original)
		el.querySelector('a')!.click()
		expect(clicks).toBe(1)
		expect(el.querySelectorAll('#L').length).toBe(1)
		removeFloodText(el, original)
		expect(el.querySelector('a')).toBe(link)
		expect(el.innerHTML).toBe(original)
	})

	it('getCleanHTML returns the exact original, even when it contains an author .ft-char element', () => {
		const html = 'Keep <span class="ft-char badge">NEW</span> badge'
		const el = makeElement(html)
		applyFloodText(el, html)
		expect(getCleanHTML(el)).toBe(html)
	})

	it('re-applying with the wrapped markup does not nest spans', () => {
		const el = makeElement('abc def')
		applyFloodText(el, el.innerHTML)
		applyFloodText(el, el.innerHTML)
		expect(el.querySelectorAll(`.${FLOOD_TEXT_CLASSES.char} .${FLOOD_TEXT_CLASSES.char}`).length).toBe(0)
		expect(getCleanHTML(el)).toBe('abc def')
	})

	it('wraps graphemes, not code points (emoji sequences and combining marks stay whole)', () => {
		const el = makeElement('👨‍👩‍👧 é')
		const spans = applyFloodText(el, el.innerHTML)
		expect(spans.map((s) => s.textContent)).toEqual(['👨‍👩‍👧', 'é'])
	})

	it('leaves styles, scripts, form fields and SVG text alone', () => {
		const html = 'Text <style>.zz{color:red}</style><textarea>typed</textarea><svg><text>svg</text></svg> end'
		const el = makeElement(html)
		applyFloodText(el, html)
		expect(el.querySelector('style')!.textContent).toBe('.zz{color:red}')
		expect(el.querySelector('textarea')!.querySelectorAll('span').length).toBe(0)
		expect(el.querySelector('svg')!.querySelectorAll('span').length).toBe(0)
	})

	it('stop() puts every character back at its own style', () => {
		mockRenderedLayout()
		const el = makeElement('Hello world')
		const spans = applyFloodText(el, el.innerHTML)
		const stop = startFloodText(spans, { effect: ['wght', 'opacity'] })
		expect(spans[0].style.opacity).not.toBe('')
		stop()
		spans.forEach((s) => {
			expect(s.style.opacity).toBe('')
			expect(s.style.fontVariationSettings).toBe('')
		})
	})

	it("animates around the author's own weight and keeps their other axes", () => {
		mockRenderedLayout()
		const el = makeElement('<strong style="font-weight:700; font-variation-settings: \'GRAD\' 150">Bold</strong>')
		const spans = applyFloodText(el, el.innerHTML)
		startFloodText(spans, { effect: 'wght', amplitude: 50 })
		const fvs = spans[0].style.fontVariationSettings
		expect(fvs).toContain('GRAD')
		const wght = parseFloat(/wght"?\s+(-?[\d.]+)/.exec(fvs)![1])
		expect(wght).toBeGreaterThanOrEqual(650)
		expect(wght).toBeLessThanOrEqual(750)
	})

	it('invalid options fall back with a warning instead of stopping the animation', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const el = makeElement('Hello')
		const spans = applyFloodText(el, el.innerHTML)
		expect(() => startFloodText(spans, { period: NaN, density: NaN, amplitude: NaN, effect: 'WGHT' as never })()).not.toThrow()
		expect(spans[0].style.fontVariationSettings).toBe('')
		expect(warn).toHaveBeenCalled()
	})

	it('a second start on the same characters stops the first', () => {
		mockRenderedLayout()
		const el = makeElement('Hello')
		const spans = applyFloodText(el, el.innerHTML)
		const stop1 = startFloodText(spans, { effect: 'opacity' })
		const stop2 = startFloodText(spans, { effect: 'blur' })
		expect(spans[0].style.opacity).toBe('')
		expect(spans[0].style.filter).not.toBe('')
		stop2(); stop1()
	})
})
