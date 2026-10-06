// floodText/src/core/types.ts — types and class constants

/** Style effect driven by the per-character wave */
export type FloodEffect = 'wght' | 'wdth' | 'oblique' | 'opacity' | 'rotation' | 'blur' | 'size'

/** Shape of the per-character wave cycle */
export type WaveShape = 'sine' | 'sawtooth' | 'triangle'

/**
 * A custom CSS property to animate on each character, driven by the same wave
 * as the built-in effects. Works with any CSS property or custom property (CSS variable).
 *
 * @example
 * // Animate letter-spacing per character
 * { property: 'letter-spacing', base: 0, amplitude: 0.05, unit: 'em' }
 *
 * @example
 * // Animate a CSS custom property (e.g. for a variable font axis via CSS vars)
 * { property: '--wdth', base: 100, amplitude: 20, unit: '' }
 *
 * @example
 * // Clamp opacity to a safe range
 * { property: 'opacity', base: 0.8, amplitude: 0.2, unit: '', clamp: [0, 1] }
 */
export interface FloodProperty {
	/** Any valid CSS property name or custom property (e.g. 'letter-spacing', '--my-axis') */
	property: string
	/** Neutral value around which the wave oscillates */
	base: number
	/** Peak deviation from base */
	amplitude: number
	/** CSS unit appended to the computed value (e.g. 'em', 'px', 'deg', '%'). Default: '' */
	unit?: string
	/** Optional [min, max] clamp applied after wave calculation */
	clamp?: [number, number]
}

/** Options controlling the flood-text character wave animation */
export interface FloodTextOptions {
	/**
	 * Built-in effect(s) to animate per character. Pass an array to layer multiple effects simultaneously.
	 * (default: 'wght')
	 */
	effect?: FloodEffect | FloodEffect[]
	/**
	 * Amplitude source. Default: 'fixed'
	 *
	 * - **'fixed'** (default) — all characters use the same amplitude (from `amplitude` / `amplitudes`).
	 *
	 * - **'sentiment'** — per-word AFINN emotional valence scores scale the amplitude.
	 *   Words with strong emotional charge (rage, joy, grief) pulse at higher amplitude;
	 *   neutral function words (the, of, and) pulse at minimum. Scores are normalised
	 *   so the most extreme word in the paragraph always reaches full amplitude.
	 *   Requires the `sentiment` package: `npm install sentiment`.
	 *   Falls back to 'fixed' if `sentiment` is not installed.
	 */
	source?: 'fixed' | 'sentiment'
	/**
	 * Peak deviation from the neutral value, in style-specific units.
	 * Only used when a single built-in effect is active — for multiple effects use `amplitudes`.
	 * (default: auto per effect)
	 */
	amplitude?: number
	/**
	 * Per-effect amplitude overrides when layering multiple built-in effects.
	 * Defaults: wght 200, wdth 20, oblique 15deg, opacity 0.3, rotation 15deg, blur 2px, size 0.15em.
	 */
	amplitudes?: Partial<Record<FloodEffect, number>>
	/**
	 * Custom CSS properties to animate on each character, driven by the same wave.
	 * Can be used alongside `effect` or as the sole animation source.
	 * Uses `element.style.setProperty()` internally — works for both regular properties and CSS variables.
	 */
	properties?: FloodProperty[]
	/** Seconds per full wave cycle (default: 4) */
	period?: number
	/** Number of wave cycles visible across the full paragraph at once (default: 2) */
	density?: number
	/** Wave travel direction through the text (default: 'diagonal-down') */
	direction?: 'right' | 'left' | 'diagonal-down' | 'diagonal-up'
	/** Shape of the wave (default: 'sine') */
	waveShape?: WaveShape
	/**
	 * Automatically pause the rAF loop when the element scrolls out of the viewport
	 * and resume it when it returns. Uses IntersectionObserver internally.
	 * (default: true)
	 */
	pauseOffscreen?: boolean
}

/** CSS class names injected by flood-text — use these to target generated markup */
export const FLOOD_TEXT_CLASSES = {
	char: 'ft-char',
	/** Line break inserted at the end of each line, locking the browser's own breaks while the wave runs */
	br: 'ft-br',
	/** Hyphen shown where the browser had hyphenated a word at a locked line end */
	hyphen: 'ft-hy',
	probe: 'ft-probe',
} as const
