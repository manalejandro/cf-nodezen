import { Logo } from "@/components/logo";
import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg p-8 text-center">
			<div className="text-accent">
				<Logo size={56} />
			</div>
			<div>
				<h1 className="text-2xl font-bold tracking-tight text-ink">This page found its inner void</h1>
				<p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
					The room or page you are looking for does not exist. Room links look like{" "}
					<span className="font-mono text-accent-ink">/r/nz-abcdefghij</span>.
				</p>
			</div>
			<Link className="nz-btn nz-btn-primary !px-5 !py-2.5" href="/">
				Back to NodeZen
			</Link>
		</div>
	);
}
