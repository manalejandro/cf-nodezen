"use client";

import { useTheme } from "./theme";
import { IconMoon, IconSun } from "./icons";

export function ThemeToggle({ className }: { className?: string }) {
	const { resolved, toggle } = useTheme();
	return (
		<button
			aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
			className={`nz-icon-btn ${className ?? ""}`}
			onClick={toggle}
			title={resolved === "dark" ? "Light theme" : "Dark theme"}
			type="button"
		>
			{resolved === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
		</button>
	);
}
