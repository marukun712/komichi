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
import { isActorIdentifier } from "@atcute/lexicons/syntax";

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

export async function resolveAuthorFeed(repo: string) {
	try {
		if (!isActorIdentifier(repo)) return null;
		const actor = await actorResolver.resolve(repo);
		const rpc = new Client({
			handler: simpleFetchHandler({ service: "https://public.api.bsky.app" }),
		});

		const res = await rpc.get("app.bsky.feed.getAuthorFeed", {
			params: {
				actor: actor.did,
			},
		});

		return res;
	} catch (e) {
		console.error(e);
		return null;
	}
}

export async function resolveRecords(
	repo: string,
	collection: `${string}.${string}.${string}`,
) {
	try {
		if (!isActorIdentifier(repo)) return null;
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
	} catch (e) {
		console.error(e);
		return null;
	}
}

export async function resolveProfile(repo: string) {
	try {
		if (!isActorIdentifier(repo)) return null;
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
	} catch (e) {
		console.error(e);
		return null;
	}
}
