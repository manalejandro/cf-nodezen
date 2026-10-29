"use client";

import { useRoom } from "@/lib/store";
import { useSession } from "@/lib/session-context";
import { languageFromPath } from "@/lib/workspace/types";
import { IconFile, IconX } from "@/components/icons";

function tabName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

function tabColor(path: string): string {
	switch (languageFromPath(path)) {
		case "typescript":
			return "#3f8fe0";
		case "javascript":
			return "#d9a15c";
		case "json":
			return "#a9d984";
		case "markdown":
			return "#9aa8ff";
		default:
			return "var(--ink-faint)";
	}
}

export function EditorTabs() {
	const openTabs = useRoom((s) => s.openTabs);
	const activePath = useRoom((s) => s.activePath);
	const peers = useRoom((s) => s.peers);
	const session = useSession();

	if (openTabs.length === 0) {
		return <div className="h-9 shrink-0 border-b border-line bg-surface-2" />;
	}

	return (
		<div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-surface-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
			{openTabs.map((path) => {
				const isActive = path === activePath;
				const watchers = Object.values(peers).filter((p) => p.openFile === path);
				return (
					<div
						className={`nz-tab ${isActive ? "active" : ""}`}
						key={path}
						onClick={() => session.openFile(path)}
						onAuxClick={(e) => {
							if (e.button === 1) session.closeTab(path);
						}}
						role="tab"
						aria-selected={isActive}
						title={path}
					>
						<span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: tabColor(path) }} />
						<span className="max-w-[180px] truncate">{tabName(path)}</span>
						{watchers.length ? (
							<span className="-space-x-1">
								{watchers.slice(0, 3).map((w) => (
									<span
										className="inline-block h-1.5 w-1.5 rounded-full ring-1 ring-surface"
										key={w.profile.id}
										style={{ backgroundColor: w.profile.color }}
										title={`${w.profile.name} is here`}
									/>
								))}
							</span>
						) : null}
						<button
							aria-label={`Close ${tabName(path)}`}
							className="nz-icon-btn !h-4.5 !w-4.5 !rounded hover:!bg-surface-3"
							onClick={(e) => {
								e.stopPropagation();
								session.closeTab(path);
							}}
							type="button"
						>
							<IconX size={11} />
						</button>
					</div>
				);
			})}
			<div className="flex flex-1 items-center border-b-0 px-2 text-ink-faint opacity-0">
				<IconFile size={12} />
			</div>
		</div>
	);
}
