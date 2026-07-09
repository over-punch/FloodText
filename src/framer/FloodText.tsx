// floodText/src/framer/FloodText.tsx — Framer code component wrapping the floodText core.
//
// Distribution: paste this file into Framer (Insert → Code → New Component), or host it as an
// ES module and add it by URL. It imports the framework-agnostic core straight from the CDN, so
// it needs no build step — the core functions take a DOM element, not React, so there is no
// React version/externalisation issue.
//
// The rendering logic mirrors the already-proven `useFloodText` hook (applyFloodText in an effect,
// startFloodText for the rAF loop); the only Framer-specific additions are the property controls,
// RenderTarget gating, and layout annotations.
import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
// Pin to a published version so shared instances stay stable. Bump when the core changes.
// The core is framework-agnostic (operates on a DOM element), so no React externalisation is needed.
import { applyFloodText, startFloodText, getCleanHTML } from "https://esm.sh/@liiift-studio/floodtext@1.0.19"

/** Props surfaced to the Framer UI via addPropertyControls, plus base text styling.
 *  Option fields are declared explicitly so the component needs no type import over HTTP. */
interface FloodTextFramerProps {
	/** The text to animate. */
	text: string
	/** CSS font-family — MUST resolve to a variable font for axis effects (wght/wdth/oblique). */
	fontFamily: string
	/** Font size in px. */
	fontSize: number
	/** Text colour. */
	color: string
	/** Horizontal text alignment. */
	textAlign: "left" | "center" | "right"
	/** Built-in effect driven by the per-character wave. */
	effect: "wght" | "wdth" | "oblique" | "opacity" | "rotation" | "blur" | "size"
	/** Peak deviation from the neutral value (per-effect default when undefined). */
	amplitude?: number
	/** Seconds per full wave cycle. */
	period: number
	/** Number of wave cycles visible across the paragraph at once. */
	density: number
	/** Wave travel direction. */
	direction: "right" | "left" | "diagonal-down" | "diagonal-up"
	/** Wave shape. */
	waveShape: "sine" | "sawtooth" | "triangle"
}

/**
 * Per-character variable-font wave, as a Framer code component.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function FloodText(props: Partial<FloodTextFramerProps>) {
	const {
		text = "Typography that moves",
		fontFamily = "Inter",
		fontSize = 64,
		color = "#111111",
		textAlign = "left",
		effect = "wght",
		amplitude,
		period = 4,
		density = 2,
		direction = "diagonal-down",
		waveShape = "sine",
	} = props

	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = ref.current
		if (!el) return

		const options = { effect, amplitude, period, density, direction, waveShape }
		const original = getCleanHTML(el)
		const spans = applyFloodText(el, original, options)

		// Animate on the live site and on the editing canvas (so the designer sees the motion);
		// render a single static frame on export / thumbnails where a loop is undesirable.
		const target = RenderTarget.current()
		const animate = target === RenderTarget.preview || target === RenderTarget.canvas

		if (animate && spans.length > 0) {
			const stop = startFloodText(spans, options)
			return () => {
				stop()
				el.innerHTML = original
			}
		}
		return () => {
			el.innerHTML = original
		}
	}, [text, effect, amplitude, period, density, direction, waveShape])

	return (
		<div
			ref={ref}
			style={{
				fontFamily,
				fontSize,
				color,
				textAlign,
				lineHeight: 1.1,
				width: "100%",
			}}
		>
			{text}
		</div>
	)
}

// Map every meaningful FloodTextOptions field to a Framer control.
addPropertyControls(FloodText, {
	text: {
		type: ControlType.String,
		title: "Text",
		defaultValue: "Typography that moves",
		displayTextArea: true,
	},
	fontFamily: {
		type: ControlType.String,
		title: "Font",
		defaultValue: "Inter",
		description: "Must be a variable font for weight/width/oblique effects.",
	},
	fontSize: { type: ControlType.Number, title: "Size", defaultValue: 64, min: 8, max: 400, unit: "px" },
	color: { type: ControlType.Color, title: "Colour", defaultValue: "#111111" },
	textAlign: {
		type: ControlType.Enum,
		title: "Align",
		options: ["left", "center", "right"],
		optionTitles: ["Left", "Center", "Right"],
		defaultValue: "left",
		displaySegmentedControl: true,
	},
	effect: {
		type: ControlType.Enum,
		title: "Effect",
		options: ["wght", "wdth", "oblique", "opacity", "rotation", "blur", "size"],
		optionTitles: ["Weight", "Width", "Oblique", "Opacity", "Rotation", "Blur", "Size"],
		defaultValue: "wght",
	},
	amplitude: {
		type: ControlType.Number,
		title: "Amplitude",
		defaultValue: 200,
		min: 0,
		max: 500,
		description: "Peak deviation. Leave at the per-effect default if unsure.",
	},
	period: { type: ControlType.Number, title: "Period", defaultValue: 4, min: 0.2, max: 20, step: 0.1, unit: "s" },
	density: { type: ControlType.Number, title: "Density", defaultValue: 2, min: 0.5, max: 10, step: 0.5 },
	direction: {
		type: ControlType.Enum,
		title: "Direction",
		options: ["right", "left", "diagonal-down", "diagonal-up"],
		optionTitles: ["Right", "Left", "Diagonal ↘", "Diagonal ↗"],
		defaultValue: "diagonal-down",
	},
	waveShape: {
		type: ControlType.Enum,
		title: "Wave",
		options: ["sine", "sawtooth", "triangle"],
		optionTitles: ["Sine", "Sawtooth", "Triangle"],
		defaultValue: "sine",
	},
})
