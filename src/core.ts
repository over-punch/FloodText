// floodText/src/core.ts — React-free entry (@overpunch/floodtext/core): the vanilla API, safe for SSR and apps without React.
export { applyFloodText, startFloodText, removeFloodText, pauseFloodText, resumeFloodText, getCleanHTML, computeWave, loadSentiment } from './core/adjust'
export type { FloodTextOptions, FloodEffect, FloodProperty, WaveShape } from './core/types'
export { FLOOD_TEXT_CLASSES } from './core/types'
