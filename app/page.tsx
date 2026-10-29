import { Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { RoomLauncher } from "@/components/landing/room-launcher";
import { TerminalDemo } from "@/components/landing/terminal-demo";

const REPO_URL = "https://github.com/manalejandro/cf-nodezen";

export default function Home() {
	return (
		<div className="min-h-screen bg-bg text-ink">
			{/* Nav */}
			<header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
				<Wordmark size={30} />
				<nav className="flex items-center gap-1 sm:gap-3">
					<a className="nz-btn nz-btn-quiet hidden sm:inline-flex" href="#features">
						Features
					</a>
					<a className="nz-btn nz-btn-quiet hidden sm:inline-flex" href="#how">
						How it works
					</a>
					<ThemeToggle />
					<a
						aria-label="GitHub repository"
						className="nz-btn nz-btn-ghost !px-2.5"
						href={REPO_URL}
						rel="noreferrer"
						target="_blank"
						title="Source on GitHub"
					>
						<svg fill="currentColor" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg" aria-hidden>
							<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
						</svg>
					</a>
				</nav>
			</header>

			{/* Hero */}
			<main>
				<section className="relative overflow-hidden">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0"
						style={{
							background:
								"radial-gradient(60rem 30rem at 70% -10%, var(--glow), transparent 60%), radial-gradient(40rem 24rem at 10% 110%, var(--glow), transparent 55%)",
						}}
					/>
					<div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:pt-16">
						<div className="nz-anim-fade-up flex flex-col items-start gap-6">
							<span className="nz-chip !rounded-full !border-accent/30 !bg-accent-soft !text-accent-ink">
								<span className="h-1.5 w-1.5 rounded-full bg-accent" />
								Runs entirely in your browser — no installs, no sign-up
							</span>
							<h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
								Your browser
								<br />
								is the <span className="text-accent">runtime</span>.
							</h1>
							<p className="max-w-xl text-pretty text-base leading-7 text-ink-soft sm:text-lg sm:leading-8">
								NodeZen is a collaborative JavaScript, TypeScript &amp; Node.js workspace powered by the
								browser&apos;s JS engine — with a real filesystem on ZenFS, Node shims, the Monaco editor, and
								rooms that sync peer-to-peer over WebRTC on Cloudflare.
							</p>
							<RoomLauncher />
						</div>
						<div className="nz-anim-fade-up w-full lg:max-w-lg" style={{ animationDelay: "140ms" }}>
							<TerminalDemo />
						</div>
					</div>
				</section>

				{/* Features */}
				<section className="mx-auto max-w-6xl px-5 py-16" id="features">
					<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything happens client-side</h2>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft sm:text-base">
						Workspaces never touch a server database. Cloudflare only introduces peers and relays when a direct
						connection is impossible.
					</p>
					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<Feature
							title="Browser filesystem"
							body="A real POSIX-style file tree backed by ZenFS on IndexedDB. Files persist per room, per browser — private by default."
							icon="🗂️"
						/>
						<Feature
							title="Node.js shims"
							body="fs, path, process, events, Buffer, crypto, assert and more, reimplemented over the sandbox so everyday Node scripts just run."
							icon="🍃"
						/>
						<Feature
							title="TypeScript & JSX"
							body="Code is transpiled in-browser with sucrase. Monaco provides highlighting and IntelliSense with types for every shim."
							icon="⌨️"
						/>
						<Feature
							title="Rooms & invite links"
							body="Create a room, share the link, and everyone lands in the same live workspace. No accounts, no setup."
							icon="🔗"
						/>
						<Feature
							title="WebRTC sync"
							body="File ops, chat, presence and run output stream over peer-to-peer data channels, signaled by a Durable Object with relay fallback."
							icon="📡"
						/>
						<Feature
							title="Shared runs & chat"
							body="Anyone can run code; the whole room watches the output live, with remote cursors showing where teammates are typing."
							icon="🧘"
						/>
					</div>
				</section>

				{/* How it works */}
				<section className="border-y border-line bg-surface-2/60" id="how">
					<div className="mx-auto max-w-6xl px-5 py-16">
						<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
						<div className="mt-8 grid gap-6 sm:grid-cols-3">
							<Step
								n={1}
								title="Create a room"
								body="A room id is generated in your browser. The workspace seeds with a small TypeScript demo project."
							/>
							<Step
								n={2}
								title="Share the invite link"
								body="Peers join through a Cloudflare Durable Object that handles presence and WebRTC signaling."
							/>
							<Step
								n={3}
								title="Code, chat, run — together"
								body="Every edit, file, message and run result syncs peer-to-peer with conflict-free LWW merging."
							/>
						</div>
						<div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-ink-faint">
							<span>vinext + React</span>
							<span>Cloudflare Workers</span>
							<span>Durable Objects</span>
							<span>WebRTC DataChannels</span>
							<span>ZenFS + IndexedDB</span>
							<span>Monaco Editor</span>
							<span>sucrase</span>
						</div>
					</div>
				</section>

				{/* CTA */}
				<section className="mx-auto max-w-6xl px-5 py-20 text-center">
					<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Find your calm. Ship from the tab.</h2>
					<p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-soft sm:text-base">
						Open a room in seconds — your first program is one <span className="font-mono text-accent-ink">Ctrl+Enter</span>{" "}
						away.
					</p>
					<div className="mt-7 flex justify-center">
						<RoomLauncher />
					</div>
				</section>
			</main>

			<footer className="border-t border-line">
				<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-xs text-ink-faint sm:flex-row">
					<span>
						NodeZen · MIT License · built with <span className="text-ink-soft">vinext</span> on{" "}
						<span className="text-ink-soft">Cloudflare Workers</span>
					</span>
					<a className="nz-btn nz-btn-quiet !text-xs" href={REPO_URL} rel="noreferrer" target="_blank">
						github.com/manalejandro/cf-nodezen
					</a>
				</div>
			</footer>
		</div>
	);
}

function Feature({ title, body, icon }: { title: string; body: string; icon: string }) {
	return (
		<div className="nz-panel group p-5 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg">
			<div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-lg transition group-hover:scale-110">
				<span aria-hidden>{icon}</span>
			</div>
			<h3 className="text-sm font-semibold text-ink">{title}</h3>
			<p className="mt-1.5 text-[13px] leading-5.5 text-ink-soft">{body}</p>
		</div>
	);
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
	return (
		<div className="relative rounded-xl border border-line bg-surface p-5">
			<span className="absolute -top-3 left-5 flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-accent-contrast">
				{n}
			</span>
			<h3 className="mt-1 text-sm font-semibold text-ink">{title}</h3>
			<p className="mt-1.5 text-[13px] leading-5.5 text-ink-soft">{body}</p>
		</div>
	);
}
