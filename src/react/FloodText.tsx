// floodText/src/react/FloodText.tsx — React component wrapper
import React, { Children, forwardRef, isValidElement, useCallback } from 'react'
import { useFloodText } from './useFloodText'
import type { FloodTextOptions } from '../core/types'

interface FloodTextProps extends FloodTextOptions, Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style'> {
	children: React.ReactNode
	className?: string
	style?: React.CSSProperties
	as?: React.ElementType
}

/** FloodTextOptions keys: consumed by the hook, not forwarded to the DOM element. */
const OPTION_KEYS: (keyof FloodTextOptions)[] = [
	'effect', 'source', 'amplitude', 'amplitudes', 'properties', 'period', 'density', 'direction', 'waveShape', 'pauseOffscreen',
]

/**
 * A string that changes whenever the rendered content of `children` changes: text, element types,
 * keys and primitive props, walked recursively. Functions and objects are ignored.
 */
function childrenSignature(children: React.ReactNode): string {
	const parts: string[] = []
	const walk = (node: React.ReactNode) => {
		Children.forEach(node, (child) => {
			if (child === null || child === undefined || typeof child === 'boolean') return
			if (typeof child === 'string' || typeof child === 'number') { parts.push(String(child)); return }
			if (isValidElement(child)) {
				const type = typeof child.type === 'string' ? child.type : ((child.type as { displayName?: string; name?: string }).displayName ?? (child.type as { name?: string }).name ?? 'C')
				const props = child.props as Record<string, unknown>
				const attrs = Object.keys(props).filter((k) => k !== 'children' && ['string', 'number', 'boolean'].includes(typeof props[k])).sort().map((k) => `${k}=${String(props[k])}`)
				parts.push(`<${type}${child.key != null ? '#' + child.key : ''} ${attrs.join(' ')}>`)
				walk(props.children as React.ReactNode)
				parts.push(`</${type}>`)
			}
		})
	}
	walk(children)
	return parts.join('\u0000')
}

/**
 * Drop-in component that applies the flood-text effect to its children. HTML attributes (id, aria-*,
 * data-*, lang, event handlers…) are forwarded to the element; the ref is forwarded to it too.
 */
export const FloodText = forwardRef<HTMLElement, FloodTextProps>(
	function FloodText({ children, className, style, as: Tag = 'p', ...rest }, forwardedRef) {
		const options: FloodTextOptions = {}
		const htmlProps: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(rest)) {
			if ((OPTION_KEYS as string[]).includes(key)) (options as Record<string, unknown>)[key] = value
			else htmlProps[key] = value
		}
		// The library rewrites the element's text nodes, so React can't patch new children into it. When
		// the children or the tag change, remount the element (key) and re-run on the fresh content.
		const contentKey = `${typeof Tag === 'string' ? Tag : 'C'}|${childrenSignature(children)}`
		const innerRef = useFloodText(options, contentKey)

		/** Merge the hook's internal ref with the forwarded ref so both are satisfied. */
		const mergedRef = useCallback(
			(node: HTMLElement | null) => {
				;(innerRef as React.MutableRefObject<HTMLElement | null>).current = node
				if (typeof forwardedRef === 'function') {
					forwardedRef(node)
				} else if (forwardedRef) {
					forwardedRef.current = node
				}
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[forwardedRef],
		)

		return (
			<Tag key={contentKey} ref={mergedRef as React.Ref<HTMLElement>} className={className} style={style} {...htmlProps}>
				{children}
			</Tag>
		)
	},
)

FloodText.displayName = 'FloodText'
