import type { AppBskyFeedPost } from "@atcute/bluesky";
import type { Agent } from "@atproto/api";
// @ts-expect-error
import * as druid from "@saehrimnir/druidjs";
import { createSignal, onMount, Show } from "solid-js";
import { cosineSimilarity, getVec } from "../lib/Embedding";
import { resolveAuthorFeed } from "../lib/Resolver";

export default function Posts(props: { agent: Agent }) {
	const [currentDid, setCurrentDid] = createSignal("");
	const [isSearching, setIsSearching] = createSignal<boolean>(false);
	const [errorMessage, setErrorMessage] = createSignal<string>("");

	onMount(async () => {
		setCurrentDid(props.agent.assertDid);
		searchNext();
	});

	const searchNext = async () => {
		if (isSearching()) return;

		if (!currentDid()) {
			setErrorMessage("探索を続行できません");
			return;
		}

		setIsSearching(true);
		setErrorMessage("");

		try {
			const matrix: number[][] = [];

			const posts = await props.agent.com.atproto.repo.listRecords({
				repo: props.agent.assertDid,
				collection: "app.bsky.feed.post",
				limit: 20,
			});

			const parsedPosts = posts.data.records
				.map((r) => r.value as AppBskyFeedPost.Main)
				.filter((r) => r.text !== "");

			const embeddings = await Promise.all(
				parsedPosts.map(async (r) => await getVec(r.text)),
			);

			const feed = await resolveAuthorFeed(currentDid(), 100);

			if (!feed || !feed.ok) {
				setErrorMessage("フィードの取得に失敗しました");
				return;
			}

			const parsedFeed = feed.data.feed
				.filter((r) => r.post.author.did !== currentDid())
				.map((r) => r.post.record.text as string)
				.filter((r) => r !== "")
				.slice(0, 20);

			console.log(parsedFeed);

			if (parsedFeed.length !== embeddings.length) {
				setErrorMessage("タイムラインに十分な投稿がありません");
				return;
			}

			const tlEmbeddings = await Promise.all(
				parsedFeed.map((post) => getVec(post)),
			);

			for (const source of embeddings) {
				const row = tlEmbeddings.map((target) =>
					cosineSimilarity(source, target),
				);
				matrix.push(row);
			}

			const distanceMatrix = matrix.map((row) => row.map((sim) => 1 - sim));
			const parsed = druid.Matrix.from(distanceMatrix);

			const mds = new druid.MDS(parsed, {
				d: 2,
				metric: "precomputed",
			});
			const coords = mds.transform();
			console.log(coords);
		} catch (e) {
			console.error(e);
			setErrorMessage("投稿の取得に失敗しました");
		} finally {
			setIsSearching(false);
		}
	};

	return (
		<div class="space-y-4">
			<button type="button" onClick={searchNext} disabled={isSearching()}>
				{isSearching() ? "探索中..." : "次を探索"}
			</button>
			<Show when={errorMessage()}>
				<p class="text-red-500">{errorMessage()}</p>
			</Show>
		</div>
	);
}
