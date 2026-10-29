"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { loadTheme, resolveTheme, saveTheme, type Theme } from "@/lib/identity";

interface ThemeContextValue {
	theme: Theme;
	resolved: "light" | "dark";
	setTheme(theme: Theme): void;
	toggle(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setThemeState] = useState<Theme>("system");
	const [resolved, setResolved] = useState<"light" | "dark">("dark");

	useEffect(() => {
		const stored = loadTheme();
		setThemeState(stored);
		apply(stored);
		const mq = matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => {
			setThemeState((current) => {
				if (current === "system") apply("system");
				return current;
			});
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function apply(next: Theme) {
		const value = resolveTheme(next);
		document.documentElement.classList.toggle("dark", value === "dark");
		document.documentElement.dataset.theme = value;
		setResolved(value);
	}

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next);
		saveTheme(next);
		apply(next);
	}, []);

	const toggle = useCallback(() => {
		setTheme(resolved === "dark" ? "light" : "dark");
	}, [resolved, setTheme]);

	return <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
	return ctx;
}

/** Runs before first paint to avoid theme flashes. Injected into <head>. */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("nodezen.theme");
    var theme = stored === "light" || stored === "dark" ? stored : "system";
    var dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {}
})();
`;
