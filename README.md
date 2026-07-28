# Flood Text

[![npm](https://img.shields.io/npm/v/%40liiift-studio%2Ffloodtext.svg)](https://www.npmjs.com/package/@liiift-studio/floodtext) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![part of liiift type-tools](https://img.shields.io/badge/liiift-type--tools-blueviolet)](https://github.com/Liiift-Studio/type-tools)

A wave washes through the paragraph character by character — modulating weight, width, oblique angle, or opacity as it passes. Not line by line, not word by word: every letterform sits at its own moment in the curve. At low amplitude it reads as texture; at high amplitude, as transformation.

![A wave of font weight and opacity travelling diagonally through three paragraphs of text — each character surging bold as the wave crests and fading light as it troughs, while word spacing and line breaks stay perfectly still](https://raw.githubusercontent.com/Liiift-Studio/FloodText/main/assets/flood-wave.gif?v=1)

> Layering `wght` + `opacity` on a sine wave travelling diagonally. [Try the live demo →](https://floodtext.com)

**[floodtext.com](https://floodtext.com)** · [npm](https://www.npmjs.com/package/@liiift-studio/floodtext) · [GitHub](https://github.com/Liiift-Studio/FloodText)

TypeScript · Zero dependencies · React + Vanilla JS

---

## Install

```bash
npm install @liiift-studio/floodtext
```

---

## Usage

> **Next.js App Router:** this library uses browser APIs. Add `"use client"` to any component file that imports from it.

### React component

```tsx
import { FloodText } from '@liiift-studio/floodtext'

<FloodText effect="wght" amplitude={200} period={4} density={2} direction="diagonal-down">
  Your paragraph text here...
</FloodText>
```

Layer multiple effects simultaneously:

```tsx
<FloodText effect={['wght', 'oblique']} period={4} density={2}>
  Your paragraph text here...
</FloodText>
```

### React hook

```tsx
import { useFloodText } from '@liiift-studio/floodtext'

// Inside a React component:
const ref = useFloodText({ effect: 'wght', amplitude: 200, period: 4, density: 2 })
return <p ref={ref}>{children}</p>
```

The hook starts the animation loop on mount, re-wraps characters and restarts on container resize via `ResizeObserver`, and cleans up on unmount.

### Vanilla JS

`applyFloodText` wraps characters and returns them. `startFloodText` drives the animation loop and returns a stop function. Options are shared between `applyFloodText` and `startFloodText`.

```ts
import { applyFloodText, startFloodText, pauseFloodText, resumeFloodText, removeFloodText, getCleanHTML } from '@liiift-studio/floodtext'

const el = document.querySelector('p')
const original = getCleanHTML(el)
const opts = { effect: 'wght', amplitude: 200, period: 4, density: 2 }

let chars = applyFloodText(el, original)
let stop = startFloodText(chars, opts)

// On resize — re-wrap characters and restart (diagonal directions read BCR positions once):
const ro = new ResizeObserver(() => {
  stop()
  chars = applyFloodText(el, original)
  stop = startFloodText(chars, opts)
})
ro.observe(el)

// Later — stop the animation loop and restore the DOM:
stop()
ro.disconnect()
removeFloodText(el, original)

// Pause and resume without stopping the loop or losing position:
pauseFloodText(el)   // Pause an active flood animation on a container element
resumeFloodText(el)  // Resume a paused flood animation
```

### TypeScript

```ts
import type { FloodTextOptions, FloodEffect } from '@liiift-studio/floodtext'

const effects: FloodEffect[] = ['wght', 'oblique']
const opts: FloodTextOptions = { effect: effects, period: 4 }
```

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `effect` | `'wght'` | `'wght'` \| `'wdth'` \| `'oblique'` \| `'opacity'` \| `'rotation'` \| `'blur'` \| `'size'`. Pass an array to layer multiple effects simultaneously. Note: `oblique` requires Chrome 87+, Firefox 88+, Safari 14.1+. `size` causes layout recalculation per frame — use low amplitude |
| `source` | `'fixed'` | `'fixed'` — all characters share the same amplitude. `'sentiment'` — per-word AFINN emotional valence scales amplitude; words with strong charge pulse at full amplitude, neutral function words pulse at minimum. Requires `npm install sentiment`; falls back to `'fixed'` if not installed |
| `amplitude` | auto | Peak deviation from neutral. Used in single-effect mode. Defaults: `wght` 200, `wdth` 20, `oblique` 15°, `opacity` 0.3, `rotation` 15°, `blur` 2px, `size` 0.15em |
| `amplitudes` | — | Per-effect overrides when layering multiple effects, e.g. `{ wght: 300, blur: 3 }` |
| `properties` | — | Custom CSS properties or variables to animate per character. Each entry: `{ property, base, amplitude, unit?, clamp? }` where `clamp` is an optional `[min, max]` pair to cap the result (e.g. `[0, 1]` for opacity). E.g. `[{ property: 'letter-spacing', base: 0, amplitude: 0.05, unit: 'em' }]` or `[{ property: '--my-axis', base: 100, amplitude: 20, clamp: [50, 150] }]` |
| `period` | `4` | Seconds per full wave cycle |
| `density` | `2` | Wave cycles visible across the paragraph at once. Higher = more bands |
| `direction` | `'diagonal-down'` | `'diagonal-down'` ↘ \| `'diagonal-up'` ↗ \| `'right'` → \| `'left'` ←. All directions use 2D screen coordinates from `getBoundingClientRect` — read once before the animation loop starts |
| `waveShape` | `'sine'` | `'sine'` \| `'sawtooth'` \| `'triangle'` |
| `pauseOffscreen` | `true` | Pause the animation when the element scrolls out of view; resume when visible. Uses IntersectionObserver internally |
| `as` | `'p'` | HTML element to render, e.g. `'h1'`, `'span'`. *(React component only)* |

---

## How it works

Every visible character is wrapped in an inline `<span>`. Whitespace is left as bare text nodes — no layout impact, no reflow. Each frame, the wave function is evaluated at that character's normalised position in the paragraph. The `density` option controls how many wave cycles are visible at once.

For all directions, each character's 2D screen coordinates are read via `getBoundingClientRect` once before the loop starts. `right`/`left` use the horizontal x-coordinate so characters at the same column across lines are in phase; diagonal directions project onto a 2D axis. Speed is framerate-independent; the loop excludes time the tab was hidden to prevent phase jumps when re-entering focus. In React, the animation loop is tied to the component lifecycle and stops automatically on unmount. The React hook skips the animation entirely if `prefers-reduced-motion: reduce` is set.

**Line break safety:** Character spans are inline (not inline-block), so applying styles per character does not change line widths or word breaks. The browser's natural line-breaking is fully preserved.

---

## Dev notes

### `next` in root devDependencies

`package.json` at the repo root lists `next` as a devDependency. This is a **Vercel detection workaround** — not a real dependency of the npm package. Vercel's build system inspects the root `package.json` to detect the framework; without `next` present it falls back to a static build and skips the Next.js pipeline, breaking the `/site` subdirectory deploy.

The package itself has zero runtime dependencies. Do not remove this entry.

---

## Future improvements

- **Per-character easing** — apply a custom easing curve to individual character offsets, not just the raw wave value
- **More built-in effects** — `hue` (color hue rotation), `shadow` (text-shadow offset), `skew` (CSS skewX)
- **SSR-compatible static snapshot** — render a stable mid-wave frame on the server so there is no FOUC before hydration
