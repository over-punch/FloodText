"use client"

// Interactive flood-text demo with cursor/gyro mode, global scale for multi-effect, and live controls
import { useState, useEffect, useDeferredValue, useRef, useMemo, useCallback } from "react"
import { useMediaQuery, useClientValue } from "@/lib/clientValue"
import { FloodText, pauseFloodText, resumeFloodText } from "@liiift-studio/floodtext"
import type { FloodEffect } from "@liiift-studio/floodtext"

const PARAGRAPHS = [
	`A wave washes through the paragraph — not line by line, not word by word, but character by character. Every letterform sits at its own position in the curve: weight surges as the wave crests and falls as it troughs, oblique angles tilt and recover, opacity breathes through each glyph in sequence. The text is the same, but it is no longer still.`,
	`CSS applies properties to elements, not to individual characters. Font variation settings, opacity, transforms — all or nothing, the entire block at once. Flood Text works around this by wrapping each visible character in its own span, evaluating the wave function at that character's normalised position, and writing the result as an inline style. Whitespace is left as bare text nodes and never touched — no layout impact, no reflow.`,
	`At low amplitude the effect is texture: a subtle restlessness the reader feels before they name it, like the slight variation in hand-set type. At high amplitude it becomes transformation — weight swinging from hairline to black, letters tilting into italics and back, the whole paragraph in motion. Density controls how many wave cycles are visible at once; period controls the tempo. Layer wght with oblique, or opacity with wdth, and the motion compounds into something no single CSS property could produce.`,
]

/** Stable string used for character count — computed once at module level (#62) */
const SAMPLE = PARAGRAPHS.join(' ')

/** Total character count for caption — computed once at module level (#62) */
const SAMPLE_CHAR_COUNT = SAMPLE.replace(/\s/g, '').length

type Direction = 'diagonal-down' | 'diagonal-up' | 'right' | 'left'

const DIRECTION_LABELS: Record<Direction, string> = {
	'diagonal-down': '↘',
	'diagonal-up':   '↗',
	'right':         '→',
	'left':          '←',
}

const DIRECTION_DESCRIPTION: Record<Direction, string> = {
	'diagonal-down': 'top-left to bottom-right',
	'diagonal-up':   'bottom-left to top-right',
	'right':         'left to right',
	'left':          'right to left',
}

/** Amplitude defaults and slider ranges per effect type */
const EFFECT_CONFIG: Record<FloodEffect, { default: number; min: number; max: number; step: number; unit: string }> = {
	wght:     { default: 200,  min: 10,   max: 400,  step: 10,   unit: 'wght units' },
	wdth:     { default: 20,   min: 1,    max: 50,   step: 1,    unit: 'wdth units' },
	oblique:  { default: 15,   min: 1,    max: 30,   step: 1,    unit: 'deg'        },
	opacity:  { default: 0.3,  min: 0.1,  max: 0.7,  step: 0.05, unit: ''           },
	rotation: { default: 15,   min: 1,    max: 45,   step: 1,    unit: 'deg'        },
	blur:     { default: 2,    min: 0.1,  max: 8,    step: 0.1,  unit: 'px'         },
	size:     { default: 0.15, min: 0.02, max: 0.5,  step: 0.01, unit: 'em'         },
}

const ALL_EFFECTS: FloodEffect[] = ['wght', 'wdth', 'oblique', 'opacity', 'rotation', 'blur', 'size']

/** Tooltip text for each effect toggle button */
const EFFECT_TOOLTIP: Record<FloodEffect, string> = {
	wght:     'Animates font weight — characters surge from light to bold as the wave crests',
	wdth:     'Animates font width — characters compress and expand as the wave passes through',
	oblique:  'Animates oblique angle — letters tilt forward and back along the wave',
	opacity:  'Animates opacity — characters fade in and out, giving the text a breathing quality',
	rotation: 'Animates CSS rotation — each character tilts on its own axis as the wave rolls through',
	blur:     'Animates blur — characters sharpen and soften in sequence, as if drifting in and out of focus',
	size:     'Animates font size — characters grow and shrink as the wave crests, creating a ripple in scale',
}

/** Tooltip text for each wave shape button */
const WAVE_TOOLTIP: Record<'sine' | 'sawtooth' | 'triangle', string> = {
	sine:     'Smooth sinusoidal curve — the wave eases in and out, producing fluid, organic motion',
	sawtooth: 'Instant reset after each peak — the effect ramps up abruptly then drops, giving a sharp, mechanical feel',
	triangle: 'Linear ramp up then down — motion is constant-speed with hard direction changes at peaks and troughs',
}

/** Labelled range slider with live value announced to screen readers via aria-describedby (#47) */
function Slider({ label, value, min, max, step, fmt, onChange, title, disabled }: { label: string; value: number; min: number; max: number; step: number; fmt?: (v: number) => string; onChange: (v: number) => void; title?: string; disabled?: boolean }) {
	// Stable id derived from label for aria-describedby association
	const valueId = `slider-val-${label.replace(/\s+/g, '-').toLowerCase()}`
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">{label}</span>
			<input type="range" min={min} max={max} step={step} value={value} aria-label={label} aria-describedby={valueId} title={title} disabled={disabled} onChange={e => onChange(Number(e.target.value))} onTouchStart={e => e.stopPropagation()} style={{ touchAction: 'none', opacity: disabled ? 0.35 : undefined, cursor: disabled ? 'not-allowed' : undefined }} />
			<span id={valueId} className="tabular-nums text-xs text-muted text-right">{fmt ? fmt(value) : value}</span>
		</div>
	)
}

/** Before/after toggle — left half = without effect, right half filled = with effect (#56: SVG aria-hidden) */
function BeforeAfterToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
	return (
		<button
			onClick={onClick}
			aria-label="Toggle before/after comparison"
			aria-pressed={active}
			title={active ? 'Hide comparison' : 'Compare without effect'}
			style={{
				position: 'absolute', bottom: 0, right: 0,
				width: 32, height: 32, borderRadius: '50%',
				border: '1px solid currentColor',
				opacity: active ? 0.8 : 0.45,
				background: 'transparent',
				display: 'flex', alignItems: 'center', justifyContent: 'center',
				cursor: 'pointer', transition: 'opacity 0.15s ease',
			}}
		>
			<svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true" focusable="false">
				<rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1"/>
				<line x1="7" y1="0.5" x2="7" y2="9.5" stroke="currentColor" strokeWidth="1"/>
				<rect x="8" y="1.5" width="5" height="7" fill="currentColor"/>
			</svg>
		</button>
	)
}

/** Cursor icon SVG */
function CursorIcon() {
	return (
		<svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" aria-hidden="true" focusable="false">
			<path d="M0 0L0 11L3 8L5 13L6.8 12.3L4.8 7.3L8.5 7.3Z" />
		</svg>
	)
}

/** Gyroscope icon SVG — circle with rotation arrow */
function GyroIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" focusable="false">
			<circle cx="7" cy="7" r="5.5" />
			<circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
			<path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" strokeWidth="1.4" />
			<path d="M11.5 5.5 L12.5 7 L13.8 6" strokeWidth="1.2" />
		</svg>
	)
}

export default function Demo() {
	// Wave controls
	const [activeEffects, setActiveEffects] = useState<Set<FloodEffect>>(new Set(['wght', 'opacity']))
	const [amplitude, setAmplitude] = useState(EFFECT_CONFIG.wght.default)
	const [period, setPeriod] = useState(4)
	const [density, setDensity] = useState(2)
	const [scale, setScale] = useState(1.0)
	const [direction, setDirection] = useState<Direction>('diagonal-down')
	const [waveShape, setWaveShape] = useState<'sine' | 'sawtooth' | 'triangle'>('sine')
	const [beforeAfter, setComparing] = useState(false)

	// Pause/resume state and container ref
	const [paused, setPaused] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Guard so pause/resume effect skips initial mount (#51)
	const mountedRef = useRef(false)

	// Interaction modes — mutually exclusive
	const [cursorMode, setCursorMode] = useState(false)
	const [gyroMode, setGyroMode] = useState(false)

	// Gyro-driven values — kept separate from slider state so slider value props
	// never change during gyro mode (which would cause mobile to scroll to the input)
	const [gyroDensity, setGyroDensity] = useState(2)
	const [gyroPeriod, setGyroPeriod] = useState(4)

	// Detected capabilities — resolved client-side after mount
	const showCursor = useMediaQuery('(hover: hover)')
	const isTouch = useMediaQuery('(hover: none)')
	const hasOrientation = useClientValue(() => 'DeviceOrientationEvent' in window, false)
	const showGyro = isTouch && hasOrientation

	// Reduced-motion preference — start paused if user prefers reduced motion (#48)
	useEffect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
		if (mq.matches) setPaused(true)
	}, [])

	// Effective values: gyro-driven when gyroMode active, slider-driven otherwise
	const effectiveDensity = gyroMode ? gyroDensity : density
	const effectivePeriod  = gyroMode ? gyroPeriod  : period

	const dAmplitude = useDeferredValue(amplitude)
	const dPeriod    = useDeferredValue(effectivePeriod)
	const dDensity   = useDeferredValue(effectiveDensity)
	const dScale     = useDeferredValue(scale)

	/** Stable style object — not recreated every render (#61) */
	const sampleStyle: React.CSSProperties = useMemo(() => ({
		fontFamily: "var(--font-merriweather), serif",
		fontSize: "1.125rem",
		lineHeight: "1.8",
		fontVariationSettings: '"wght" 300, "opsz" 18, "wdth" 100',
	}), [])

	const singleEffect = activeEffects.size === 1 ? [...activeEffects][0] : null

	/** Stable effect toggle handler (#63) */
	const handleEffectToggle = useCallback((v: FloodEffect) => {
		setActiveEffects(prev => {
			const next = new Set(prev)
			if (next.has(v)) {
				// Always keep at least one effect active
				if (next.size > 1) next.delete(v)
			} else {
				next.add(v)
			}
			// If switching to single effect, reset amplitude to that effect's default
			if (next.size === 1) setAmplitude(EFFECT_CONFIG[[...next][0]].default)
			return next
		})
	}, [])

	// Cursor mode — X controls density (0.5–5), Y controls period (inverted: top=slow 12s, bottom=fast 1s)
	useEffect(() => {
		if (!cursorMode) return
		const handleMove = (e: MouseEvent) => {
			const newDensity = parseFloat((0.5 + (e.clientX / window.innerWidth) * 4.5).toFixed(1))
			const newPeriod  = parseFloat((1 + (1 - e.clientY / window.innerHeight) * 11).toFixed(1))
			setDensity(Math.round(newDensity * 2) / 2)
			setPeriod(Math.round(newPeriod * 2) / 2)
		}
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setCursorMode(false)
		}
		window.addEventListener('mousemove', handleMove)
		window.addEventListener('keydown', handleKey)
		return () => {
			window.removeEventListener('mousemove', handleMove)
			window.removeEventListener('keydown', handleKey)
		}
	}, [cursorMode])

	// Gyro mode — gamma (left/right tilt) → density, beta (front/back tilt) → period (inverted).
	// Updates gyroDensity/gyroPeriod (not slider state) so slider value props stay frozen,
	// preventing mobile browsers from scrolling to the input on each orientation update.
	// rAF throttle limits re-renders to one per frame.
	useEffect(() => {
		if (!gyroMode) return
		let rafId: number | null = null
		const handleOrientation = (e: DeviceOrientationEvent) => {
			if (rafId !== null) return
			rafId = requestAnimationFrame(() => {
				rafId = null
				if (e.gamma !== null) {
					// gamma: -90 (tilt left) to 90 (tilt right) → density 0.5–5
					const raw = 0.5 + ((e.gamma + 90) / 180) * 4.5
					setGyroDensity(Math.round(raw * 2) / 2)
				}
				if (e.beta !== null) {
					// beta ~90 upright, decreases tilting back — invert: tilt back = slower (longer period)
					const clamped = Math.max(15, Math.min(90, e.beta))
					const raw = 1 + ((90 - clamped) / 75) * 11
					setGyroPeriod(Math.round(raw * 2) / 2)
				}
			})
		}
		window.addEventListener('deviceorientation', handleOrientation)
		return () => {
			window.removeEventListener('deviceorientation', handleOrientation)
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [gyroMode])

	// Pause/resume effect — skips initial mount so it only runs after animation exists (#51)
	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true
			return
		}
		if (!containerRef.current) return
		if (paused) {
			pauseFloodText(containerRef.current)
		} else {
			resumeFloodText(containerRef.current)
		}
	}, [paused])

	/** Stable pause toggle handler (#63) */
	const togglePause = useCallback(() => setPaused(v => !v), [])

	/** Stable cursor toggle handler (#63) */
	const toggleCursor = useCallback(() => {
		setGyroMode(false)
		setCursorMode(v => !v)
	}, [])

	/** Toggle gyro mode — requests iOS permission with try/catch (#50) */
	const toggleGyro = useCallback(async () => {
		if (gyroMode) {
			setGyroMode(false)
			return
		}
		setCursorMode(false)
		const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
			requestPermission?: () => Promise<PermissionState>
		}
		if (typeof DOE.requestPermission === 'function') {
			try {
				const permission = await DOE.requestPermission()
				if (permission === 'granted') setGyroMode(true)
			} catch {
				// Permission denied or dialog dismissed — remain in off state
			}
		} else {
			setGyroMode(true)
		}
	}, [gyroMode])

	const cfg = singleEffect ? EFFECT_CONFIG[singleEffect] : null

	/** Stable effect prop — single string or array, not recreated every render (#61) */
	const effectProp: FloodEffect | FloodEffect[] = useMemo(
		() => singleEffect ?? [...activeEffects],
		[singleEffect, activeEffects]
	)

	// Amplitude passed to FloodText: single effect uses the amplitude slider,
	// multi-effect uses the scale slider value as a uniform amplitude proxy
	const effectiveAmplitude = singleEffect ? dAmplitude : dScale

	// Sliders are inactive (and visually dimmed) when cursor or gyro mode is driving values (#49)
	const activeMode = cursorMode || gyroMode

	return (
		<div className="w-full">
			{/* Wave controls — period and density sliders are disabled during cursor/gyro mode (#49) */}
			<div className="grid grid-cols-3 gap-6 mb-6">
				{singleEffect && cfg ? (
					<Slider label={`Amplitude${cfg.unit ? ` (${cfg.unit})` : ''}`} value={amplitude} min={cfg.min} max={cfg.max} step={cfg.step} fmt={cfg.step < 1 ? v => v.toFixed(2) : undefined} onChange={setAmplitude} title={`How far the wave swings the ${singleEffect} value above and below its baseline — higher amplitude = more dramatic variation character by character`} />
				) : (
					<Slider label="Scale ×" value={scale} min={0.1} max={3.0} step={0.1} fmt={v => v.toFixed(1)} onChange={setScale} title="Uniform multiplier applied to all active effects simultaneously — scale up for bolder motion, scale down to blend effects subtly" />
				)}
				<Slider label="Period (s)" value={effectivePeriod} min={1} max={12} step={0.5} onChange={setPeriod} title="Time in seconds for one complete wave cycle — shorter period = faster ripple through the text, longer period = slow rolling motion" disabled={activeMode} />
				<Slider label="Density" value={effectiveDensity} min={0.5} max={5} step={0.5} onChange={setDensity} title="Number of wave cycles visible across the text at once — low density = one gentle sweep, high density = many rapid ripples" disabled={activeMode} />
			</div>

			{/* Effect toggle group (#54: role=group with accessible label) */}
			<div className="flex flex-wrap items-center gap-3 mb-8">
				<div role="group" aria-label="Effect" className="flex flex-wrap items-center gap-3">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted" aria-hidden="true">Effect</span>
					{ALL_EFFECTS.map(v => (
						<button key={v} onClick={() => handleEffectToggle(v)} aria-pressed={activeEffects.has(v)} aria-label={EFFECT_TOOLTIP[v]} title={EFFECT_TOOLTIP[v]} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: activeEffects.has(v) ? 1 : 0.5, background: activeEffects.has(v) ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
					))}
				</div>

				{/* Wave shape toggle group (#54) */}
				<div role="group" aria-label="Wave shape" className="flex flex-wrap items-center gap-3 ml-4">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted" aria-hidden="true">Wave</span>
					{(['sine', 'sawtooth', 'triangle'] as const).map(v => (
						<button key={v} onClick={() => setWaveShape(v)} aria-pressed={waveShape === v} aria-label={WAVE_TOOLTIP[v]} title={WAVE_TOOLTIP[v]} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: waveShape === v ? 1 : 0.5, background: waveShape === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
					))}
				</div>

				{/* Direction toggle group (#54, #57: arrow symbol hidden from AT) */}
				<div role="group" aria-label="Wave direction" className="flex flex-wrap items-center gap-3 ml-4">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted" aria-hidden="true">Direction</span>
					{(['diagonal-down', 'diagonal-up', 'right', 'left'] as const).map(v => (
						<button key={v} onClick={() => setDirection(v)} aria-pressed={direction === v} aria-label={DIRECTION_DESCRIPTION[v]} title={DIRECTION_DESCRIPTION[v]} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: direction === v ? 1 : 0.5, background: direction === v ? 'var(--btn-bg)' : 'transparent' }}>
							<span aria-hidden="true">{DIRECTION_LABELS[v]}</span>
						</button>
					))}
				</div>

				{/* Cursor mode — desktop/hover-capable devices only */}
				{showCursor && (
					<button
						onClick={toggleCursor}
						aria-pressed={cursorMode}
						aria-label={cursorMode ? 'Cursor mode active — press Escape to exit' : 'Enable cursor mode: move cursor to control density and period'}
						title="Move your cursor to control density (X) and period (Y)"
						className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ml-auto"
						style={{
							borderColor: 'currentColor',
							opacity: cursorMode ? 1 : 0.5,
							background: cursorMode ? 'var(--btn-bg)' : 'transparent',
						}}
					>
						<CursorIcon />
						<span>{cursorMode ? 'Esc to exit' : 'Cursor'}</span>
					</button>
				)}

				{/* Gyro mode — touch devices with DeviceOrientationEvent */}
				{showGyro && (
					<button
						onClick={toggleGyro}
						aria-pressed={gyroMode}
						aria-label={gyroMode ? 'Tilt mode active — tap to disable' : 'Enable tilt mode: tilt device to control density and period'}
						title="Tilt your device to control density (left/right) and period (front/back)"
						className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ml-auto"
						style={{
							borderColor: 'currentColor',
							opacity: gyroMode ? 1 : 0.5,
							background: gyroMode ? 'var(--btn-bg)' : 'transparent',
						}}
					>
						<GyroIcon />
						<span>{gyroMode ? 'Tilt active' : 'Tilt'}</span>
					</button>
				)}

				{/* Pause/resume toggle */}
				<button
					onClick={togglePause}
					aria-pressed={paused}
					aria-label={paused ? 'Resume animation' : 'Pause animation'}
					title={paused ? 'Resume animation' : 'Pause animation'}
					className="text-xs px-3 py-1 rounded-full border transition-opacity"
					style={{
						borderColor: 'currentColor',
						opacity: paused ? 1 : 0.5,
						background: paused ? 'var(--btn-bg)' : 'transparent',
					}}
				>
					{paused ? 'Resume' : 'Pause'}
				</button>
			</div>

			{/* Live text — stable keys from paragraph index label (#60) */}
			<div className="relative pb-8">
				<div ref={containerRef} className="flex flex-col gap-8">
					{PARAGRAPHS.map((para, i) => (
						<FloodText
							key={`para-${i}`}
							effect={effectProp}
							amplitude={effectiveAmplitude}
							period={dPeriod}
							density={dDensity}
							direction={direction}
							waveShape={waveShape}
							as="p"
							style={sampleStyle}
						>
							{para}
						</FloodText>
					))}
				</div>
				{beforeAfter && (
					<div aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: '100%', pointerEvents: 'none', opacity: 0.25 }} className="flex flex-col gap-8">
						{PARAGRAPHS.map((para, i) => (
							<p key={`before-${i}`} style={{ ...sampleStyle, margin: 0 }}>{para}</p>
						))}
					</div>
				)}
				<BeforeAfterToggle active={beforeAfter} onClick={() => setComparing(v => !v)} />
			</div>

			{/* Caption */}
			<div className="flex items-center gap-3 mt-8">
				{activeMode ? (
					<p className="text-xs text-muted italic" style={{ lineHeight: "1.8" }}>
						{cursorMode ? 'Move cursor to adjust density (X) and period (Y). Press Esc to exit.' : 'Tilt left/right for density, front/back for period.'}
					</p>
				) : (
					<p className="text-xs text-muted italic" style={{ lineHeight: "1.8" }}>
						A {waveShape} wave traveling {DIRECTION_DESCRIPTION[direction]} through {SAMPLE_CHAR_COUNT} characters
						{singleEffect
							? ` — ±${amplitude}${cfg?.unit ? ' ' + cfg.unit : ''} on ${singleEffect}`
							: ` — layering ${[...activeEffects].join(' + ')} at scale ×${scale.toFixed(1)}`
						}, density {effectiveDensity}, period {effectivePeriod}s.
					</p>
				)}
			</div>
		</div>
	)
}
