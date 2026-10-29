"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoom, useRoomStore } from "@/lib/store";
import { useSession } from "@/lib/session-context";
import type { TreeNode } from "@/lib/workspace/types";
import {
	IconChevronDown,
	IconChevronRight,
	IconFile,
	IconFolder,
	IconFolderOpen,
	IconPencil,
	IconPlus,
	IconTrash,
} from "@/components/icons";
import { useToast } from "@/components/toast";

type Creating = { type: "file" | "dir"; parent: string } | null;
type Renaming = { path: string; initial: string } | null;

interface Handlers {
	expanded: Set<string>;
	toggleDir(path: string): void;
	creating: Creating;
	setCreating(c: Creating): void;
	renaming: Renaming;
	setRenaming(r: Renaming): void;
	armedDelete: string | null;
	confirmDelete(path: string): void;
	commitCreate(name: string): void;
	commitRename(from: string, name: string): void;
	watchers: Map<string, { name: string; color: string }[]>;
}

export function FileExplorer() {
	const tree = useRoom((s) => s.tree);
	const store = useRoomStore();
	const session = useSession();
	const { toast } = useToast();
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["/"]));
	const [creating, setCreating] = useState<Creating>(null);
	const [renaming, setRenaming] = useState<Renaming>(null);
	const [armedDelete, setArmedDelete] = useState<string | null>(null);

	// Auto-expand directories that contain open tabs.
	const openTabs = useRoom((s) => s.openTabs);
	useEffect(() => {
		setExpanded((prev) => {
			let changed = false;
			const next = new Set(prev);
			for (const tab of openTabs) {
				const parts = tab.split("/");
				for (let i = 1; i < parts.length; i++) {
					const key = "/" + parts.slice(1, i).join("/");
					if (!next.has(key)) {
						next.add(key);
						changed = true;
					}
				}
			}
			return changed ? next : prev;
		});
	}, [openTabs]);

	// Disarm delete confirmation on any click elsewhere.
	useEffect(() => {
		if (!armedDelete) return;
		const disarm = () => setArmedDelete(null);
		const t = setTimeout(() => window.addEventListener("click", disarm, { once: true }), 0);
		return () => {
			clearTimeout(t);
			window.removeEventListener("click", disarm);
		};
	}, [armedDelete]);

	const peers = useRoom((s) => s.peers);
	const watchers = useMemo(() => {
		const map = new Map<string, { name: string; color: string }[]>();
		for (const p of Object.values(peers)) {
			if (!p.openFile) continue;
			const list = map.get(p.openFile) ?? [];
			list.push({ name: p.profile.name, color: p.profile.color });
			map.set(p.openFile, list);
		}
		return map;
	}, [peers]);

	function toggleDir(path: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}

	function normalize(parent: string, name: string): string | null {
		const trimmed = name.trim().replace(/^\/+/, "");
		if (!trimmed) return null;
		if (trimmed.split("/").includes("..")) {
			toast("Path cannot contain '..'", "error");
			return null;
		}
		const base = parent === "/" ? "" : parent;
		return `/${[base, trimmed].filter(Boolean).join("/")}`;
	}

	function commitCreate(name: string) {
		if (!creating) return;
		const parent = creating.parent;
		setCreating(null);
		const path = normalize(parent, name);
		if (!path) return;
		try {
			const type = creating.type;
			if (type === "dir") {
				session.createDirectory(path);
			} else {
				session.createFile(path, "");
				session.openFile(path);
			}
			setExpanded((prev) => new Set(prev).add(parent));
		} catch (err) {
			toast(String((err as Error).message ?? err), "error");
		}
	}

	function commitRename(from: string, name: string) {
		setRenaming(null);
		const trimmed = name.trim();
		if (!trimmed) return;
		const parent = from.slice(0, from.lastIndexOf("/")) || "/";
		const to = normalize(parent, trimmed);
		if (!to || to === from) return;
		try {
			session.renamePath(from, to);
		} catch (err) {
			toast(String((err as Error).message ?? err), "error");
		}
	}

	function confirmDelete(path: string) {
		if (armedDelete !== path) {
			setArmedDelete(path);
			return;
		}
		setArmedDelete(null);
		try {
			session.deletePath(path);
		} catch (err) {
			toast(String((err as Error).message ?? err), "error");
		}
	}

	const handlers: Handlers = {
		expanded,
		toggleDir,
		creating,
		setCreating,
		renaming,
		setRenaming,
		armedDelete,
		confirmDelete,
		commitCreate,
		commitRename,
		watchers,
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-3">
				<span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Workspace</span>
				<span className="ml-auto flex gap-0.5">
					<button
						aria-label="New file"
						className="nz-icon-btn !h-6 !w-6"
						onClick={() => setCreating({ type: "file", parent: "/" })}
						title="New file"
						type="button"
					>
						<IconFile size={13} />
					</button>
					<button
						aria-label="New folder"
						className="nz-icon-btn !h-6 !w-6"
						onClick={() => setCreating({ type: "dir", parent: "/" })}
						title="New folder"
						type="button"
					>
						<IconFolder size={13} />
					</button>
					<button
						aria-label="New file with path"
						className="nz-icon-btn !h-6 !w-6"
						onClick={() => store.set({ modal: "new-file", modalContext: "/" })}
						title="New file… (with path)"
						type="button"
					>
						<IconPlus size={13} />
					</button>
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto py-1.5" role="tree">
				{creating?.parent === "/" ? (
					<div className="px-2">
						<InlineInput
							initial=""
							onCancel={() => setCreating(null)}
							onCommit={commitCreate}
							placeholder={creating.type === "file" ? "file.ts" : "folder"}
						/>
					</div>
				) : null}
				{sortNodes(tree).map((node) => (
					<FileNode depth={0} handlers={handlers} key={node.path} node={node} />
				))}
				{tree.length === 0 ? (
					<p className="px-3 py-2 text-xs text-ink-faint">Empty workspace. Create a file to get started.</p>
				) : null}
			</div>
		</div>
	);
}

function FileNode({ node, depth, handlers }: { node: TreeNode; depth: number; handlers: Handlers }) {
	const session = useSession();
	const active = useRoom((s) => s.activePath === node.path);
	const isDir = node.type === "dir";
	const isOpen = handlers.expanded.has(node.path);
	const nodeWatchers = handlers.watchers.get(node.path) ?? [];

	if (handlers.renaming?.path === node.path) {
		return (
			<div style={{ paddingLeft: 8 + depth * 12 }} className="px-1 py-0.5">
				<InlineInput
					initial={handlers.renaming.initial}
					onCancel={() => handlers.setRenaming(null)}
					onCommit={(value) => handlers.commitRename(node.path, value)}
				/>
			</div>
		);
	}

	return (
		<div>
			<div
				aria-selected={active}
				className={`nz-tree-row ${active ? "active" : ""}`}
				onClick={() => (isDir ? handlers.toggleDir(node.path) : session.openFile(node.path))}
				onKeyDown={(e) => {
					if (e.key === "Enter") isDir ? handlers.toggleDir(node.path) : session.openFile(node.path);
				}}
				role="treeitem"
				style={{ paddingLeft: 8 + depth * 12 }}
				tabIndex={0}
			>
				{isDir ? (
					<span className="shrink-0 text-ink-faint">
						{isOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
					</span>
				) : (
					<span className="w-[13px] shrink-0" />
				)}
				<span className={`shrink-0 ${isDir ? "text-accent-ink opacity-75" : "text-ink-faint"}`}>
					{isDir ? (
						isOpen ? (
							<IconFolderOpen size={14} />
						) : (
							<IconFolder size={14} />
						)
					) : (
						<IconFile size={14} />
					)}
				</span>
				<span className="truncate font-mono text-[12.5px]">{node.name}</span>
				{nodeWatchers.length ? (
					<span className="ml-auto flex shrink-0 items-center -space-x-1">
						{nodeWatchers.slice(0, 3).map((w) => (
							<span
								className="inline-block h-2 w-2 rounded-full ring-1 ring-surface"
								key={w.name}
								style={{ backgroundColor: w.color }}
								title={`${w.name} is viewing this file`}
							/>
						))}
					</span>
				) : null}
				<span className="nz-tree-actions" onClick={(e) => e.stopPropagation()}>
					{isDir ? (
						<button
							aria-label={`New file in ${node.name}`}
							className="nz-icon-btn !h-5 !w-5"
							onClick={() => handlers.setCreating({ type: "file", parent: node.path })}
							type="button"
						>
							<IconPlus size={12} />
						</button>
					) : null}
					<button
						aria-label={`Rename ${node.name}`}
						className="nz-icon-btn !h-5 !w-5"
						onClick={() => handlers.setRenaming({ path: node.path, initial: node.name })}
						type="button"
					>
						<IconPencil size={11} />
					</button>
					<button
						aria-label={`Delete ${node.name}`}
						className={`nz-icon-btn danger !h-5 !w-5 ${handlers.armedDelete === node.path ? "!bg-danger-soft !text-danger" : ""}`}
						onClick={() => handlers.confirmDelete(node.path)}
						title={handlers.armedDelete === node.path ? "Click again to confirm" : "Delete"}
						type="button"
					>
						<IconTrash size={11} />
					</button>
				</span>
			</div>

			{isDir && isOpen ? (
				<div role="group">
					{handlers.creating?.parent === node.path ? (
						<div className="px-1 py-0.5" style={{ paddingLeft: 8 + (depth + 1) * 12 }}>
							<InlineInput
								initial=""
								onCancel={() => handlers.setCreating(null)}
								onCommit={handlers.commitCreate}
								placeholder={handlers.creating.type === "file" ? "file.ts" : "folder"}
							/>
						</div>
					) : null}
					{sortNodes(node.children ?? []).map((child) => (
						<FileNode depth={depth + 1} handlers={handlers} key={child.path} node={child} />
					))}
				</div>
			) : null}
		</div>
	);
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
	return nodes.slice().sort((a, b) => {
		if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

function InlineInput({
	initial,
	onCommit,
	onCancel,
	placeholder,
}: {
	initial: string;
	onCommit(value: string): void;
	onCancel(): void;
	placeholder?: string;
}) {
	const [value, setValue] = useState(initial);
	const ref = useRef<HTMLInputElement>(null);
	const committed = useRef(false);

	useEffect(() => {
		ref.current?.focus();
		const dot = initial.lastIndexOf(".");
		ref.current?.setSelectionRange(0, dot > 0 ? dot : initial.length);
	}, [initial]);

	const commit = (v: string) => {
		if (committed.current) return;
		committed.current = true;
		onCommit(v);
	};
	const cancel = () => {
		if (committed.current) return;
		committed.current = true;
		onCancel();
	};

	return (
		<input
			className="nz-input !px-2 !py-1 font-mono !text-xs"
			onBlur={() => (value.trim() ? commit(value) : cancel())}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === "Enter") commit(value);
				if (e.key === "Escape") cancel();
			}}
			placeholder={placeholder}
			ref={ref}
			value={value}
		/>
	);
}
