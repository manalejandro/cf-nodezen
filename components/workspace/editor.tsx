"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoom, useRoomStore } from "@/lib/store";
import { useSession } from "@/lib/session-context";
import { useTheme } from "@/components/theme";
import { languageFromPath } from "@/lib/workspace/types";
import { Logo } from "@/components/logo";
import type { Monaco } from "@/lib/monaco";

type Editor = Monaco["editor"]["IStandaloneCodeEditor"];
type Model = Monaco["editor"]["ITextModel"];

const SAVE_DEBOUNCE_MS = 380;

export function CodeEditor() {
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor | null>(null);
	const monacoRef = useRef<Monaco | null>(null);
	const modelsRef = useRef<Map<string, Model>>(new Map());
	const viewStatesRef = useRef<Map<string, unknown>>(new Map());
	const applyingRemote = useRef(false);
	const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const decorationsRef = useRef<Monaco["editor"]["IEditorDecorationsCollection"] | null>(null);

	const [ready, setReady] = useState(false);
	const { resolved } = useTheme();
	const store = useRoomStore();
	const session = useSession();

	const activePath = useRoom((s) => s.activePath);
	const contents = useRoom((s) => s.contents);
	const peers = useRoom((s) => s.peers);

	const activeContent = activePath ? contents[activePath] : undefined;
	const isBinary = activeContent?.enc === "b64";

	/* ------------------------------ bootstrap ------------------------------ */

	useEffect(() => {
		let disposed = false;
		(async () => {
			const mod = await import("@/lib/monaco");
			if (disposed || !containerRef.current) return;
			const monaco = mod.setupMonaco();
			monacoRef.current = monaco;

			const editor = monaco.editor.create(containerRef.current, {
				...mod.EDITOR_OPTIONS,
				theme: document.documentElement.classList.contains("dark") ? "nodezen-dark" : "nodezen-light",
			});
			editorRef.current = editor;

			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => runActive());
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runActive());
			editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
				flushSave(currentPathRef.current);
			});

			editor.onDidChangeModelContent(() => {
				if (applyingRemote.current) return;
				const path = currentPathRef.current;
				const model = editor.getModel();
				if (!path || !model) return;
				scheduleSave(path, model.getValue());
			});

			editor.onDidChangeCursorPosition((e) => {
				const pos = { lineNumber: e.position.lineNumber, column: e.position.column };
				store.set({ selfCursor: pos });
				const path = currentPathRef.current;
				session.broadcastEditorState(path, pos);
			});

			decorationsRef.current = editor.createDecorationsCollection([]);
			setReady(true);
		})();

		return () => {
			disposed = true;
			editorRef.current?.dispose();
			editorRef.current = null;
			for (const model of modelsRef.current.values()) model.dispose();
			modelsRef.current.clear();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* -------------------------------- theme -------------------------------- */

	useEffect(() => {
		monacoRef.current?.editor.setTheme(resolved === "dark" ? "nodezen-dark" : "nodezen-light");
	}, [resolved, ready]);

	/* --------------------------- model management --------------------------- */

	const currentPathRef = useRef<string | null>(null);

	const getModel = useCallback(
		(path: string, initial: string): Model | null => {
			const monaco = monacoRef.current;
			if (!monaco) return null;
			const existing = modelsRef.current.get(path);
			if (existing) return existing;
			const model = monaco.editor.createModel(
				initial,
				languageFromPath(path),
				monaco.Uri.from({ scheme: "nodezen", path }),
			);
			modelsRef.current.set(path, model);
			return model;
		},
		[],
	);

	const dropModel = useCallback((path: string) => {
		const model = modelsRef.current.get(path);
		if (model) {
			model.dispose();
			modelsRef.current.delete(path);
		}
		viewStatesRef.current.delete(path);
		const timer = saveTimers.current.get(path);
		if (timer) clearTimeout(timer);
		saveTimers.current.delete(path);
	}, []);

	// Switch model when the active tab changes.
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || !ready) return;

		const prevPath = currentPathRef.current;
		if (prevPath && prevPath !== activePath) {
			const state = editor.saveViewState();
			if (state) viewStatesRef.current.set(prevPath, state);
			flushSave(prevPath);
		}

		currentPathRef.current = activePath;

		if (!activePath || isBinary) {
			editor.setModel(null);
			return;
		}

		const content = contents[activePath];
		if (!content) return;
		const model = getModel(activePath, content.enc === "b64" ? "" : content.content);
		if (!model) return;
		editor.setModel(model);
		const saved = viewStatesRef.current.get(activePath);
		if (saved) editor.restoreViewState(saved as never);
		editor.focus();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activePath, ready, isBinary]);

	// Drop models for closed tabs.
	const openTabs = useRoom((s) => s.openTabs);
	useEffect(() => {
		if (!ready) return;
		const open = new Set(openTabs);
		for (const path of [...modelsRef.current.keys()]) {
			if (!open.has(path)) dropModel(path);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [openTabs, ready]);

	// External (remote) content changes → apply to model preserving undo.
	useEffect(() => {
		if (!ready || !activePath || isBinary) return;
		const model = modelsRef.current.get(activePath);
		const content = contents[activePath];
		if (!model || !content || content.enc === "b64") return;
		if (model.getValue() === content.content) return;

		const editor = editorRef.current;
		applyingRemote.current = true;
		try {
			if (editor && editor.getModel() === model) {
				model.pushEditOperations(
					[],
					[{ range: model.getFullModelRange(), text: content.content }],
					() => null,
				);
			} else {
				model.setValue(content.content);
			}
		} finally {
			// Reset asynchronously so the change event fired by the edit is ignored.
			queueMicrotask(() => {
				applyingRemote.current = false;
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [contents, activePath, ready, isBinary]);

	/* ------------------------------ saving --------------------------------- */

	const scheduleSave = useCallback(
		(path: string, value: string) => {
			const existing = saveTimers.current.get(path);
			if (existing) clearTimeout(existing);
			saveTimers.current.set(
				path,
				setTimeout(() => {
					saveTimers.current.delete(path);
					session.writeFile(path, value);
				}, SAVE_DEBOUNCE_MS),
			);
		},
		[session],
	);

	const flushSave = useCallback(
		(path: string | null) => {
			if (!path) return;
			const timer = saveTimers.current.get(path);
			if (timer) {
				clearTimeout(timer);
				saveTimers.current.delete(path);
				const model = modelsRef.current.get(path);
				if (model) session.writeFile(path, model.getValue());
			}
		},
		[session],
	);

	const runActive = useCallback(() => {
		const path = currentPathRef.current;
		if (!path) return;
		flushSave(path);
		void session.startRun(path);
	}, [flushSave, session]);

	/* --------------------------- remote cursors ----------------------------- */

	useEffect(() => {
		const monaco = monacoRef.current;
		const decorations = decorationsRef.current;
		if (!monaco || !decorations || !ready) return;

		const remote = Object.values(peers).filter(
			(p) => p.openFile && p.openFile === activePath && p.cursor,
		);

		// Inject per-peer colors for the caret CSS class.
		let style = document.getElementById("nz-peer-cursor-style") as HTMLStyleElement | null;
		if (!style) {
			style = document.createElement("style");
			style.id = "nz-peer-cursor-style";
			document.head.appendChild(style);
		}
		style.textContent = remote
			.map((p) => `.nz-rc-${cssSafe(p.profile.id)} { --peer-color: ${p.profile.color}; }`)
			.join("\n");

		decorations.set(
			remote.map((p) => ({
				range: new monaco.Range(p.cursor!.lineNumber, p.cursor!.column, p.cursor!.lineNumber, p.cursor!.column),
				options: {
					className: `nz-remote-cursor nz-rc-${cssSafe(p.profile.id)}`,
					after: {
						content: p.profile.name,
						inlineStyleA: `background:${p.profile.color};color:#08110f;font-size:10px;font-weight:600;padding:1px 5px;border-radius:3px 3px 3px 0;position:relative;top:-14px;left:-2px;`,
					},
					showIfCollapsed: true,
				},
			})),
		);
	}, [peers, activePath, ready]);

	/* ------------------------------- render -------------------------------- */

	const showEmpty = !activePath;
	const showBinary = Boolean(activePath && isBinary);

	return (
		<div className="absolute inset-0">
			<div className="h-full w-full" ref={containerRef} />
			{showEmpty || showBinary ? (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface">
					<div className="text-line-strong">
						<Logo size={64} />
					</div>
					{showEmpty ? (
						<div className="flex flex-col items-center gap-1.5 text-center">
							<p className="text-sm text-ink-soft">Select a file from the workspace to start editing</p>
							<p className="flex items-center gap-1.5 text-xs text-ink-faint">
								<span className="nz-kbd">Ctrl</span>+<span className="nz-kbd">Enter</span> runs the active file
							</p>
						</div>
					) : (
						<div className="flex flex-col items-center gap-1.5 text-center">
							<p className="font-mono text-sm text-ink-soft">{activePath}</p>
							<p className="text-xs text-ink-faint">Binary file — preview is not available</p>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}

function cssSafe(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, "");
}
