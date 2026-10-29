import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROOM_ID_RE } from "@/lib/protocol";
import { Workspace } from "@/components/workspace/workspace";

interface RoomPageProps {
	params: Promise<{ roomId: string }>;
}

export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
	const { roomId } = await params;
	return {
		title: `Room ${roomId}`,
		description: `Join the NodeZen room ${roomId} — a collaborative in-browser Node.js workspace.`,
		robots: { index: false, follow: false },
	};
}

export default async function RoomPage({ params }: RoomPageProps) {
	const { roomId } = await params;
	if (!ROOM_ID_RE.test(roomId)) notFound();
	return <Workspace roomId={roomId} />;
}
