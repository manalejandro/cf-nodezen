/** NodeZen identity mark — a zen ensō enclosing a code chevron. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
	return (
		<svg
			aria-hidden
			className={className}
			fill="none"
			height={size}
			viewBox="0 0 48 48"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M41.5 24c0 9.665-7.835 17.5-17.5 17.5S6.5 33.665 6.5 24 14.335 6.5 24 6.5c5.6 0 10.586 2.63 13.767 6.72"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth="4"
			/>
			<path
				d="M20 18l-4.5 6L20 30"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="3"
			/>
			<path
				d="M28 18l4.5 6L28 30"
				opacity="0.55"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="3"
			/>
		</svg>
	);
}

export function Wordmark({ className, size = 28 }: { className?: string; size?: number }) {
	return (
		<span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
			<Logo className="text-accent" size={size} />
			<span className="font-semibold tracking-tight text-ink" style={{ fontSize: size * 0.68 }}>
				Node<span className="text-accent">Zen</span>
			</span>
		</span>
	);
}
