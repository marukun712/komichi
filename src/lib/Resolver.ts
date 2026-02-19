import type {} from "@atcute/atproto";
import { Client, simpleFetchHandler } from "@atcute/client";
import {
	CompositeDidDocumentResolver,
	CompositeHandleResolver,
	DohJsonHandleResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import type { ActorIdentifier } from "@atcute/lexicons";

const didResolver = new CompositeDidDocumentResolver({
	methods: {
		plc: new PlcDidDocumentResolver(),
		web: new WebDidDocumentResolver(),
	},
});

const handleResolver = new CompositeHandleResolver({
	methods: {
		dns: new DohJsonHandleResolver({
			dohUrl: "https://mozilla.cloudflare-dns.com/dns-query",
		}),
		http: new WellKnownHandleResolver(),
	},
});

const actorResolver = new LocalActorResolver({
	handleResolver,
	didDocumentResolver: didResolver,
});

export async function resolveRecords(
	repo: ActorIdentifier,
	collection: `${string}.${string}.${string}`,
) {
	const actor = await actorResolver.resolve(repo);
	const rpc = new Client({
		handler: simpleFetchHandler({ service: actor.pds }),
	});

	const res = await rpc.get("com.atproto.repo.listRecords", {
		params: {
			repo: actor.did,
			collection: collection,
		},
	});

	return res;
}

export async function resolveProfile(repo: ActorIdentifier) {
	const actor = await actorResolver.resolve(repo);
	const rpc = new Client({
		handler: simpleFetchHandler({ service: actor.pds }),
	});

	const res = await rpc.get("com.atproto.repo.getRecord", {
		params: {
			repo: actor.did,
			collection: "app.bsky.actor.profile",
			rkey: "self",
		},
	});

	return res;
}
