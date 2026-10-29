import { env } from "cloudflare:workers";

/**
 * GET /api/turn — ICE server configuration for room WebRTC connections.
 *
 * Always returns public STUN servers. When the worker has TURN_KEY_ID and
 * TURN_API_TOKEN secrets configured (Cloudflare Realtime TURN key), it also
 * returns short-lived TURN credentials so peers behind symmetric NATs can
 * still establish data channels.
 *
 * Ephemeral credentials are cached in isolate memory for 30 minutes.
 */

interface IceResponse {
	iceServers: RTCIceServerCompat[];
}

interface RTCIceServerCompat {
	urls: string[];
	username?: string;
	credential?: string;
}

const STUN_SERVERS: IceResponse = {
	iceServers: [
		{ urls: ["stun:stun.cloudflare.com:3478"] },
		{ urls: ["stun:stun.l.google.com:19302"] },
	],
};

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache: { expires: number; value: IceResponse } | null = null;

export async function GET(): Promise<Response> {
	const headers = {
		"content-type": "application/json",
		"cache-control": "no-store",
	};

	const keyId = (env as Record<string, string | undefined>).TURN_KEY_ID;
	const apiToken = (env as Record<string, string | undefined>).TURN_API_TOKEN;
	if (!keyId || !apiToken) {
		return Response.json(STUN_SERVERS, { headers });
	}

	if (cache && cache.expires > Date.now()) {
		return Response.json(cache.value, { headers });
	}

	try {
		const upstream = await fetch(
			`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ttl: 86400 }),
			},
		);
		if (!upstream.ok) {
			return Response.json(STUN_SERVERS, { headers });
		}
		const data = (await upstream.json()) as IceResponse;
		// Filter the port-53 URL (blocked by browsers, causes timeouts without trickle ICE).
		const iceServers = (data.iceServers ?? []).map((server) => ({
			...server,
			urls: (server.urls ?? []).filter((url) => !url.includes(":53?")),
		}));
		const value: IceResponse = { iceServers: iceServers.length ? iceServers : STUN_SERVERS.iceServers };
		cache = { expires: Date.now() + CACHE_TTL_MS, value };
		return Response.json(value, { headers });
	} catch {
		return Response.json(STUN_SERVERS, { headers });
	}
}
