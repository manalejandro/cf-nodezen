import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
	title: {
		default: "NodeZen — Node.js in the browser, together",
		template: "%s · NodeZen",
	},
	description:
		"NodeZen is a collaborative JavaScript & TypeScript workspace that runs entirely in your browser: ZenFS filesystem, Node.js shims, Monaco editor, and rooms that sync peer-to-peer over WebRTC on Cloudflare.",
	metadataBase: new URL("https://nodezen.manalejandro.com"),
	openGraph: {
		title: "NodeZen — Node.js in the browser, together",
		description:
			"A collaborative JS/TS/Node workspace in your browser. Shared rooms over WebRTC, filesystem in IndexedDB, Monaco editor.",
		url: "https://nodezen.manalejandro.com",
		siteName: "NodeZen",
		type: "website",
	},
	icons: {
		icon: "/favicon.svg",
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f4f6f1" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0d0c" },
	],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<Script
					dangerouslySetInnerHTML={{ __html: themeInitScript }}
					id="nodezen-theme-init"
					strategy="beforeInteractive"
				/>
			</head>
			<body>
				<ThemeProvider>
					<ToastProvider>{children}</ToastProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
