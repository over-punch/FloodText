// FloodText landing page — per-character wave animation tool site
import Demo from "@/components/Demo"
import CopyInstall from "@/components/CopyInstall"
import CodeBlock from "@/components/CodeBlock"
import { version } from "../../../package.json"
import { version as siteVersion } from "../../package.json"
import SiteFooter from "../components/SiteFooter"
import PortsSection from "../components/PortsSection"
import { MagnetChar } from "@liiift-studio/magnettype"

/** JSON-LD structured data for rich search results */
const jsonLd = {
	'@context': 'https://schema.org',
	'@type': 'SoftwareApplication',
	name: 'Flood Text',
	url: 'https://floodtext.com',
	applicationCategory: 'DeveloperApplication',
	operatingSystem: 'Any',
	description: 'A wave washes through text character by character — modulating weight, width, oblique angle, opacity, rotation, blur, or size. Zero dependencies, React + vanilla JS.',
	offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
	programmingLanguage: 'TypeScript',
}

export default function Home() {
	return (
		<>
		<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
		<main className="flex flex-col items-center px-6 py-20 gap-24">

			{/* Hero */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<div className="flex flex-col gap-2">
					<p className="text-xs uppercase tracking-[0.18em] font-medium text-muted">character-wave animation</p>
					<h1 className="text-4xl lg:text-8xl xl:text-9xl" style={{ fontFamily: "var(--font-merriweather), serif", fontVariationSettings: '"wght" 300, "opsz" 144', lineHeight: "1.05em" }}>
						<MagnetChar as="span" minWeight={300} maxWeight={800} spreadRadius={220} fixedAxes={{ opsz: 144 }}>Character</MagnetChar><br />
						<MagnetChar as="span" minWeight={300} maxWeight={800} spreadRadius={220} fixedAxes={{ opsz: 144 }} style={{ color: "var(--foreground-subtle)", fontStyle: "italic" }}>by character.</MagnetChar>
					</h1>
				</div>
				<div className="flex flex-wrap items-center gap-4">
					<CopyInstall />
					<a
						href="https://github.com/Liiift-Studio/FloodText"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="FloodText on GitHub (opens in new tab)"
						className="text-sm text-muted hover:text-foreground transition-colors"
					>
						GitHub ↗
					</a>
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tracking-wide">
					<span>TypeScript</span><span aria-hidden="true">·</span><span>Zero dependencies</span><span aria-hidden="true">·</span><span>React + Vanilla JS</span>
				</div>
				<p className="text-base leading-relaxed max-w-lg">
					A wave washes through the body copy character by character — modulating weight, width, oblique angle, or opacity as it passes. Not line by line, not word by word: every letterform sits at its own moment in the curve. At low amplitude it reads as texture; at high amplitude, as transformation.
				</p>
			</section>

			{/* Demo */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-4">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Live demo — watch the paragraph</h2>
				<div className="rounded-xl -mx-8 px-8 py-8" style={{ background: "var(--panel)", overflow: 'hidden' }}>
					<Demo />
				</div>
			</section>

			{/* Explanation */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">How it works</h2>
				<div className="prose-grid grid grid-cols-1 sm:grid-cols-2 gap-12 text-sm leading-relaxed">
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">Per-character phase</p>
						<p>Every visible character is wrapped in an inline span. Each frame, the wave function is evaluated at that character&rsquo;s position in the text — normalised across the whole paragraph. The density option controls how many wave cycles are visible at once.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">Traveling wave</p>
						<p>The wave advances through the characters over time using a requestAnimationFrame loop. Speed is consistent regardless of display refresh rate. The loop cleans up on unmount. Whitespace is left as bare text nodes — no layout impact, no reflow.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-base">Accessibility &amp; compatibility</p>
						<p>On e-ink and slow-refresh displays (<span className="font-mono text-xs">update: slow</span> media feature — Kindle, Remarkable, and similar panels), the wave animation produces no visible effect. FloodText detects this automatically: the element is restored to its original HTML and all animation work is skipped. The <span className="font-mono text-xs">prefers-reduced-motion: reduce</span> preference is also honoured — when set, the animation is skipped entirely and the element is left in its original state. The demo above respects this preference too: if reduced motion is set in your OS, the text will remain static.</p>
					</div>
				</div>
			</section>

			{/* Usage */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<div className="flex items-baseline gap-4">
					<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Usage</h2>
				</div>
				<div className="flex flex-col gap-8 text-sm">
					<div className="flex flex-col gap-3">
						<p className="text-muted">Drop-in component</p>
						<CodeBlock code={`import { FloodText } from '@liiift-studio/floodtext'

<FloodText effect="wght" amplitude={200} period={4} density={2} direction="diagonal-down">
  Your paragraph text here...
</FloodText>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Hook</p>
						<CodeBlock code={`import { useFloodText } from '@liiift-studio/floodtext'

const ref = useFloodText({ effect: 'wght', amplitude: 200, period: 4, density: 2, direction: 'diagonal-down' })
<p ref={ref}>{children}</p>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Vanilla JS</p>
						<CodeBlock code={`import { applyFloodText, startFloodText, removeFloodText, getCleanHTML } from '@liiift-studio/floodtext'

const el = document.querySelector('p')
const original = getCleanHTML(el)
const opts = { effect: 'wght', amplitude: 200, period: 4, density: 2, direction: 'diagonal-down' }
const chars = applyFloodText(el, original, opts)
const stop = startFloodText(chars, opts)

// Later — stop animation and restore:
stop()
removeFloodText(el, original)`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Options</p>
						<table className="w-full text-xs">
							<caption className="sr-only">FloodText options reference</caption>
							<thead>
								<tr className="text-subtle text-left">
									<th scope="col" className="pb-2 pr-6 font-normal">Option</th>
									<th scope="col" className="pb-2 pr-6 font-normal">Default</th>
									<th scope="col" className="pb-2 font-normal">Description</th>
								</tr>
							</thead>
							<tbody className="text-muted zebra">
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">effect</td><td className="py-2 pr-6">&apos;wght&apos;</td><td className="py-2">&apos;wght&apos; | &apos;wdth&apos; | &apos;oblique&apos; | &apos;opacity&apos; | &apos;rotation&apos; | &apos;blur&apos; | &apos;size&apos;. Pass an array to layer multiple effects simultaneously. Note: oblique requires Chrome 87+, Firefox 88+, Safari 14.1+. size causes layout recalculation per frame — use low amplitude.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">source</td><td className="py-2 pr-6">&apos;fixed&apos;</td><td className="py-2">&apos;fixed&apos; — all characters share the same amplitude. &apos;sentiment&apos; — per-word AFINN emotional valence scores scale the amplitude; requires <code className="font-mono">npm install sentiment</code>, falls back to &apos;fixed&apos; if not installed.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">amplitude</td><td className="py-2 pr-6">auto</td><td className="py-2">Peak deviation from neutral. Used for single-effect mode. Defaults: wght 200, wdth 20, oblique 15deg, opacity 0.3, rotation 15deg, blur 2px, size 0.15em.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">amplitudes</td><td className="py-2 pr-6">—</td><td className="py-2">Per-effect amplitude overrides when layering multiple effects. E.g. <span className="font-mono">{`{ wght: 300, blur: 3 }`}</span>.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">properties</td><td className="py-2 pr-6">—</td><td className="py-2">Animate any CSS property or CSS custom property on each character, driven by the same wave. Each entry: <span className="font-mono">{`{ property, base, amplitude, unit?, clamp? }`}</span>. Works with CSS variables. E.g. <span className="font-mono">{`[{ property: 'letter-spacing', base: 0, amplitude: 0.05, unit: 'em' }]`}</span> or <span className="font-mono">{`[{ property: '--my-axis', base: 100, amplitude: 20 }]`}</span>.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">period</td><td className="py-2 pr-6">4</td><td className="py-2">Seconds per full wave cycle.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">density</td><td className="py-2 pr-6">2</td><td className="py-2">Wave cycles visible across the paragraph at once. Higher = more bands.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">direction</td><td className="py-2 pr-6">&apos;diagonal-down&apos;</td><td className="py-2">&apos;diagonal-down&apos; ↘ | &apos;diagonal-up&apos; ↗ | &apos;right&apos; → | &apos;left&apos; ←. Diagonal directions use 2D character positions.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">waveShape</td><td className="py-2 pr-6">&apos;sine&apos;</td><td className="py-2">&apos;sine&apos; | &apos;sawtooth&apos; | &apos;triangle&apos;</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">pauseOffscreen</td><td className="py-2 pr-6">true</td><td className="py-2">Pause the animation when the element scrolls out of view; resume when visible. Uses IntersectionObserver internally.</td></tr>
								<tr className="hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">as</td><td className="py-2 pr-6">&apos;p&apos;</td><td className="py-2">HTML element to render, e.g. &apos;h1&apos;, &apos;span&apos;. Accepts any valid React element type. (FloodText component only)</td></tr>
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<PortsSection
				npm="@liiift-studio/floodtext"
				bundle="floodtext"
				attr="data-floodtext" figma="frozen"
				framerComponent="FloodText"
				repo="Liiift-Studio/FloodText"
			/>

			<SiteFooter current="floodText" npmVersion={version} siteVersion={siteVersion} />

		</main>
		</>
	)
}
