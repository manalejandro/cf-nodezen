import vinext from "vinext/server/fetch-handler";
import { NodeZenRoom } from "./room";

export { NodeZenRoom };

interface Env {
	NODEZEN_ROOM: DurableObjectNamespace;
	[key: string]: unknown;
}

const ROOM_PATH = "/rt/";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// WebSocket signaling for NodeZen rooms: /rt/<roomId>
		if (url.pathname.startsWith(ROOM_PATH)) {
			const roomId = url.pathname.slice(ROOM_PATH.length);
			if (!roomId || roomId.includes("/")) {
				return new Response("Not found", { status: 404 });
			}
			url.searchParams.set("room", roomId);
			const id = env.NODEZEN_ROOM.idFromName(roomId);
			const stub = env.NODEZEN_ROOM.get(id);
			return stub.fetch(new Request(url.toString(), request));
		}

		const handler = vinext as unknown as { fetch: typeof globalThis.fetch };
		return handler.fetch(request, env, ctx);
	},
};
