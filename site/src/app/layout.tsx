// Layout and metadata for the FloodText site — uses locally-hosted Inter 300 instead of Google Fonts
import type { Metadata } from "next"
import "./globals.css"
import SiteHeader from "../components/SiteHeader"

export const metadata: Metadata = {
	title: "Flood Text — Per-character wave animation for text",
	icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
	description: "A wave washes through text character by character — modulating weight, width, oblique angle, opacity, rotation, blur, or size. Every letterform at its own moment in the curve. React + vanilla JS.",
	keywords: ["flood text", "per-character animation", "variable font animation", "wave animation", "typography", "TypeScript", "npm"],
	openGraph: {
		title: "Flood Text — Per-character wave animation for text",
		description: "A wave washes through text character by character — modulating weight, width, oblique angle, opacity, rotation, blur, or size. Every letterform at its own moment in the curve.",
		url: "https://floodtext.com",
		siteName: "Flood Text",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Flood Text — Per-character wave animation for text",
		description: "A wave washes through text character by character — modulating weight, width, oblique angle, opacity, rotation, blur, or size. Every letterform at its own moment in the curve.",
	},
	metadataBase: new URL("https://floodtext.com"),
	alternates: { canonical: "https://floodtext.com" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className="h-full antialiased">
			<body className="min-h-full flex flex-col">
				<SiteHeader current="floodText" githubUrl="https://github.com/Liiift-Studio/FloodText" />{children}</body>
		</html>
	)
}
