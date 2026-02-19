import type { Agent } from "@atproto/api";
import { onMount } from "solid-js";
import { getHash, getWeights } from "../lib/SimHash";

export default function Posts(props: { agent: Agent }) {
	onMount(async () => {
		const posts = await props.agent.com.atproto.repo.listRecords({
			repo: props.agent.assertDid,
			collection: "app.bsky.feed.post",
		});

		const weights: number[][] = [];

		posts.data.records.forEach((r) => {
			const text = r.value.text as string;
			const w = getWeights(text, 3);
			weights.push(...w);
		});

		const hash = getHash(weights).join("");
		console.log(hash);
	});

	return <>piyopiyo</>;
}
