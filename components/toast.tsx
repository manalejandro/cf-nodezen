"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { IconCheck, IconX } from "./icons";

export interface Toast {
	id: number;
	text: string;
	tone?: "default" | "success" | "error";
}

interface ToastContextValue {
	toast(text: string, tone?: Toast["tone"]): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

	const dismiss = useCallback((id: number) => {
		setToasts((current) => current.filter((t) => t.id !== id));
		const timer = timers.current.get(id);
		if (timer) clearTimeout(timer);
		timers.current.delete(id);
	}, []);

	const toast = useCallback(
		(text: string, tone: Toast["tone"] = "default") => {
			const id = nextId++;
			setToasts((current) => [...current.slice(-3), { id, text, tone }]);
			timers.current.set(
				id,
				setTimeout(() => dismiss(id), 3200),
			);
		},
		[dismiss],
	);

	useEffect(() => {
		const map = timers.current;
		return () => {
			for (const timer of map.values()) clearTimeout(timer);
			map.clear();
		};
	}, []);

	return (
		<ToastContext.Provider value={{ toast }}>
			{children}
			<div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
				{toasts.map((t) => (
					<div
						className="nz-anim-fade-up pointer-events-auto flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-lg"
						key={t.id}
						role="status"
					>
						{t.tone === "success" ? (
							<span className="text-ok">
								<IconCheck size={15} />
							</span>
						) : t.tone === "error" ? (
							<span className="text-danger">
								<IconX size={15} />
							</span>
						) : (
							<span className="h-2 w-2 rounded-full bg-accent" />
						)}
						<span>{t.text}</span>
						<button
							aria-label="Dismiss notification"
							className="nz-icon-btn ml-1 !h-6 !w-6"
							onClick={() => dismiss(t.id)}
							type="button"
						>
							<IconX size={12} />
						</button>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx;
}
