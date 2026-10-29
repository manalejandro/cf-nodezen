"use client";

import { useEffect, useState } from "react";

interface DemoLine {
	prompt?: boolean;
	text: string;
	className: string;
	delay?: number;
}

const SCRIPT: DemoLine[] = [
	{ prompt: true, text: "node index.ts", className: "text-ink" },
	{ text: "🌸 lotus bloomed with 3 petals", className: "text-emerald-500 dark:text-emerald-400" },
	{ text: "🌸 bamboo bloomed with 5 petals", className: "text-emerald-500 dark:text-emerald-400" },
	{ text: "🌸 maple bloomed with 8 petals", className: "text-emerald-500 dark:text-emerald-400" },
	{ text: "📄 wrote /data/garden.json", className: "text-amber-500 dark:text-amber-400" },
	{ text: "[alice] hey! I see the file you just wrote 👀", className: "text-sky-500 dark:text-sky-400" },
	{ text: "[you] yes — fs syncs to everyone in the room", className: "text-violet-500 dark:text-violet-400" },
	{ text: "✔ process exited with code 0", className: "text-ink-faint" },
];

const LINE_DELAY = 900;

export function TerminalDemo() {
	const [visible, setVisible] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setVisible((v) => (v >= SCRIPT.length ? 0 : v + 1));
		}, LINE_DELAY);
		return () => clearInterval(timer);
	}, []);

	return (
		<div className="nz-panel overflow-hidden shadow-xl" aria-hidden>
			<div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-4 py-2.5">
				<span className="h-2.5 w-2.5 rounded-full bg-[#e06c60]" />
				<span className="h-2.5 w-2.5 rounded-full bg-[#d9a15c]" />
				<span className="h-2.5 w-2.5 rounded-full bg-[#7fb069]" />
				<span className="ml-3 font-mono text-[11px] text-ink-faint">nodezen — index.ts</span>
			</div>
			<div className="min-h-[220px] bg-surface p-4 font-mono text-[12.5px] leading-6">
				{SCRIPT.slice(0, visible).map((line, i) => (
					<div className={`nz-anim-fade-in ${line.className}`} key={i}>
						{line.prompt ? (
							<>
								<span className="mr-2 text-accent">zen ❯</span>
								{line.text}
							</>
						) : (
							<>
								<span className="mr-2 select-none opacity-40">·</span>
								{line.text}
							</>
						)}
					</div>
				))}
				{visible < SCRIPT.length ? <span className="nz-caret" /> : null}
			</div>
		</div>
	);
}
