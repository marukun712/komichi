import type { AppBskyFeedPost } from "@atcute/bluesky";
import {
	isResourceUri,
	parseResourceUri,
	type ResourceUri,
	type Tid,
} from "@atcute/lexicons";
import { isTid } from "@atcute/lexicons/syntax";
import type { Agent } from "@atproto/api";
import { HNSW } from "hnsw";
import { createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { getVec } from "../lib/Embedding";
import { resolveAuthorFeed, writeIndex } from "../lib/Resolver";
import GraphView from "./GraphView";

export type GraphNode = {
	postUri: string;
	did: string;
	avatarUrl: string;
	postText: string;
	authorName: string;
	createdAt: string;
};

export type Index = {
	from: string;
	to: string[];
};

export default function AppViewMode(props: { agent: Agent }) {
	const [isLoading, setIsLoading] = createSignal(false);
	const [errorMessage, setErrorMessage] = createSignal("");

	const [selected, setSelected] = createSignal<string | null>(null);
	const [graphIndex, setGraphIndex] = createSignal<Index[]>([]);

	const [index, setIndex] = createSignal<HNSW | null>(null);
	const [metaMap, setMetaMap] = createStore<Record<string, GraphNode>>();

	const vectorMap = new Map<string, number[]>();
	const visited = new Set<string>();

	onMount(async () => {
		setIsLoading(true);
		setErrorMessage("");

		try {
			const feed = await resolveAuthorFeed(props.agent.assertDid);
			if (!feed?.ok) {
				setErrorMessage("フィードの取得に失敗しました");
				return;
			}

			const tl = await props.agent.getTimeline({ limit: 100 });

			const feedItems = feed.data.feed.filter(
				(r) => (r.post.record.text as string) !== "",
			);

			const tlItems = tl.data.feed.filter(
				(r) => (r.post.record.text as string) !== "",
			);

			const seen = new Set<string>();
			const all = [...tlItems, ...feedItems].filter((item) => {
				if (seen.has(item.post.uri)) return false;
				seen.add(item.post.uri);
				return true;
			});

			const entries = await Promise.all(
				all.map(async (item) => {
					const record = item.post.record as AppBskyFeedPost.Main;
					const node: GraphNode = {
						postUri: item.post.uri,
						did: item.post.author.did,
						avatarUrl: item.post.author.avatar!,
						postText: record.text,
						authorName: item.post.author.displayName!,
						createdAt: record.createdAt,
					};
					const vector: number[] = Array.from(await getVec(record.text));
					return { node, vector };
				}),
			);

			if (entries.length === 0) {
				setErrorMessage("表示できる投稿がありません");
				return;
			}

			const index = new HNSW(16, 200, entries[0].vector.length, "cosine");
			setIndex(index);
			await index.buildIndex(
				// @ts-expect-error
				entries.map(({ node, vector }) => {
					setMetaMap(node.postUri, node);
					vectorMap.set(node.postUri, vector);
					return { id: node.postUri, vector };
				}),
			);

			const seed = entries[0].node;
			visited.add(seed.postUri);
			setSelected(seed.postUri);
			exploreNode();
		} catch (e) {
			console.error(e);
			setErrorMessage("フィードの取得に失敗しました");
		} finally {
			setIsLoading(false);
		}
	});

	const selectNode = (id: string) => {
		setSelected(id);
	};

	const selectedNode = () => {
		const id = selected();
		return id ? metaMap[id] : undefined;
	};

	const cacheIndex = async (rkey: Tid, subjects: ResourceUri[]) => {
		await writeIndex(rkey, subjects, props.agent);
	};

	const exploreNode = () => {
		const id = selected();
		const idx = index();
		if (!idx || !id) return;
		const vector = vectorMap.get(id);
		if (!vector) return;

		const results = idx.searchKNN(vector, 51);
		const neighbors = results
			// @ts-expect-error
			.map((r) => r.id as string)
			.filter((nid) => nid !== id && !visited.has(nid))
			.slice(0, 50);

		for (const neighbor of neighbors) {
			visited.add(neighbor);
		}

		const repo = parseResourceUri(id);
		if (
			repo.ok &&
			repo.value.repo === props.agent.assertDid &&
			isTid(repo.value.rkey)
		) {
			cacheIndex(
				repo.value.rkey,
				neighbors.filter((uri) => isResourceUri(uri)),
			);
		}

		setGraphIndex((prev) => [...prev, { from: id, to: neighbors }]);
	};

	return (
		<div class="space-y-4">
			<Show when={errorMessage()}>
				<p class="text-red-500">{errorMessage()}</p>
			</Show>
			<Show when={isLoading()}>
				<p>読み込み中...</p>
			</Show>
			<Show when={graphIndex().length > 0}>
				<button type="button" onClick={() => exploreNode()}>
					探索
				</button>
				<GraphView
					index={graphIndex()}
					metaMap={metaMap}
					onNodeClick={selectNode}
				/>
			</Show>
			<Show when={selectedNode()}>
				{(node) => (
					<article>
						<header>
							<h3>{node().authorName}</h3>
						</header>

						<p>{node().postText}</p>

						<footer>
							<small>
								{new Date(node().createdAt).toLocaleString("ja-JP")}
							</small>
						</footer>
					</article>
				)}
			</Show>
		</div>
	);
}
