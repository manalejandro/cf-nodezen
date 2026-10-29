"use client";

import { useEffect, useRef } from "react";
import { IconX } from "./icons";

interface ModalProps {
	open: boolean;
	onClose(): void;
	title: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
	width?: number;
}

export function Modal({ open, onClose, title, children, footer, width = 420 }: ModalProps) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey, true);
		// Focus the first input or the dialog itself.
		const input = ref.current?.querySelector<HTMLElement>("input, button");
		input?.focus();
		return () => document.removeEventListener("keydown", onKey, true);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
			aria-label={title}
		>
			<div className="nz-anim-fade-in absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
			<div
				className="nz-anim-fade-up relative w-full rounded-xl border border-line bg-surface shadow-2xl"
				ref={ref}
				style={{ maxWidth: width }}
			>
				<div className="flex items-center justify-between border-b border-line px-5 py-3.5">
					<h2 className="text-sm font-semibold text-ink">{title}</h2>
					<button aria-label="Close dialog" className="nz-icon-btn" onClick={onClose} type="button">
						<IconX size={15} />
					</button>
				</div>
				<div className="px-5 py-4">{children}</div>
				{footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div> : null}
			</div>
		</div>
	);
}
