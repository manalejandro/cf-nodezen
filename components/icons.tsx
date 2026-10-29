/** Minimal inline SVG icon set (24px grid, stroke-based, inherits currentColor). */

interface IconProps {
	size?: number;
	className?: string;
}

function base(size: number | undefined, className: string | undefined) {
	return {
		"aria-hidden": true,
		className,
		fill: "none",
		height: size ?? 16,
		stroke: "currentColor",
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		strokeWidth: 2,
		viewBox: "0 0 24 24",
		width: size ?? 16,
		xmlns: "http://www.w3.org/2000/svg",
	};
}

export const IconPlay = ({ size, className }: IconProps) => (
	<svg {...base(size, className)} fill="currentColor" stroke="none">
		<path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" />
	</svg>
);

export const IconStop = ({ size, className }: IconProps) => (
	<svg {...base(size, className)} fill="currentColor" stroke="none">
		<rect height="13" rx="2" width="13" x="5.5" y="5.5" />
	</svg>
);

export const IconFile = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M14 3v5h5" />
		<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
	</svg>
);

export const IconFolder = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.6a1 1 0 0 1-.8-.4l-1.2-1.7a1 1 0 0 0-.8-.4H4a1 1 0 0 0-1 1v13.5a1 1 0 0 0 1 1Z" />
	</svg>
);

export const IconFolderOpen = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="m6 14 1.5-4.5A2 2 0 0 1 9.4 8H21a1 1 0 0 1 1 1.2l-1.5 7a2 2 0 0 1-2 1.6H5" />
		<path d="M4 20h16" />
		<path d="M4 8V5a1 1 0 0 1 1-1h3.9a1 1 0 0 1 .8.4l1.2 1.7a1 1 0 0 0 .8.4H15a1 1 0 0 1 1 1V10" />
	</svg>
);

export const IconPlus = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M12 5v14M5 12h14" />
	</svg>
);

export const IconTrash = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
		<path d="M10 11v6M14 11v6" />
	</svg>
);

export const IconPencil = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
	</svg>
);

export const IconX = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M18 6 6 18M6 6l12 12" />
	</svg>
);

export const IconCheck = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M20 6 9 17l-5-5" />
	</svg>
);

export const IconCopy = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<rect height="13" rx="2" width="13" x="9" y="9" />
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
	</svg>
);

export const IconLink = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
		<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
	</svg>
);

export const IconUsers = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
		<circle cx="9" cy="7" r="4" />
		<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
	</svg>
);

export const IconChat = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
	</svg>
);

export const IconTerminal = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="m4 17 6-6-6-6M12 19h8" />
	</svg>
);

export const IconSun = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
	</svg>
);

export const IconMoon = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
	</svg>
);

export const IconSend = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
	</svg>
);

export const IconChevronRight = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="m9 18 6-6-6-6" />
	</svg>
);

export const IconChevronDown = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="m6 9 6 6 6-6" />
	</svg>
);

export const IconWifi = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0" />
		<circle cx="12" cy="20" fill="currentColor" r="1" stroke="none" />
	</svg>
);

export const IconBroadcast = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<circle cx="12" cy="12" r="2" />
		<path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
	</svg>
);

export const IconLogout = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
	</svg>
);

export const IconGithub = ({ size, className }: IconProps) => (
	<svg {...base(size, className)} fill="currentColor" stroke="none">
		<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
	</svg>
);

export const IconSidebar = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<rect height="18" rx="2" width="18" x="3" y="3" />
		<path d="M9 3v18" />
	</svg>
);

export const IconSparkles = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
		<path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z" />
		<path d="M5 3l.7 1.8L7.5 5.5l-1.8.7L5 8l-.7-1.8L2.5 5.5l1.8-.7Z" />
	</svg>
);

export const IconDatabase = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<ellipse cx="12" cy="5" rx="9" ry="3" />
		<path d="M3 5v14a9 3 0 0 0 18 0V5" />
		<path d="M3 12a9 3 0 0 0 18 0" />
	</svg>
);

export const IconLock = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<rect height="11" rx="2" width="18" x="3" y="11" />
		<path d="M7 11V7a5 5 0 0 1 10 0v4" />
	</svg>
);

export const IconCode = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
	</svg>
);

export const IconRefresh = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
		<path d="M21 3v5h-5" />
	</svg>
);

export const IconDownload = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
	</svg>
);

export const IconSettings = ({ size, className }: IconProps) => (
	<svg {...base(size, className)}>
		<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
		<circle cx="12" cy="12" r="3" />
	</svg>
);
