import { AppBskyFeedPost } from "@atcute/bluesky";
import {
	is,
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
import { extractKeywords } from "../lib/Keyword";
import { resolveAuthorFeed, writeIndex } from "../lib/Resolver";
import GraphView from "./GraphView";

export type GraphNode = {
	postUri: string;
	did: string;
	avatarUrl: string;
	postText: string;
	authorName: string;
	createdAt: string;
	keywords: string;
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

	const addEntries = async (items: { node: GraphNode; vector: number[] }[]) => {
		const idx = index();
		if (!idx) return;
		for (const { node, vector } of items) {
			if (vectorMap.has(node.postUri)) continue;
			setMetaMap(node.postUri, node);
			vectorMap.set(node.postUri, vector);
			// @ts-expect-error
			await idx.addPoint(node.postUri, vector);
		}
	};

	onMount(async () => {
		setIsLoading(true);
		setErrorMessage("");

		try {
			const feed = await resolveAuthorFeed(props.agent.assertDid);
			if (!feed?.ok) {
				setErrorMessage("フィードの取得に失敗しました");
				return;
			}

			const feedItems = feed.data.feed.filter(
				(r) =>
					is(AppBskyFeedPost.mainSchema, r.post.record) &&
					r.post.record.text !== "",
			);

			if (feedItems.length === 0) {
				setErrorMessage("表示できる投稿がありません");
				return;
			}

			const entries = await Promise.all(
				feedItems.map(async (item) => {
					if (!is(AppBskyFeedPost.mainSchema, item.post.record)) return null;
					const record = item.post.record;
					const vector: number[] = Array.from(await getVec(record.text));
					const keywords = await extractKeywords(record.text, vector, 1);
					const node: GraphNode = {
						postUri: item.post.uri,
						did: item.post.author.did,
						avatarUrl: item.post.author.avatar!,
						postText: record.text,
						authorName: item.post.author.displayName!,
						createdAt: record.createdAt,
						keywords,
					};
					return { node, vector };
				}),
			);

			const validEntries = entries.filter(
				(e): e is { node: GraphNode; vector: number[] } => e !== null,
			);

			if (validEntries.length === 0) {
				setErrorMessage("表示できる投稿がありません");
				return;
			}

			const idx = new HNSW(16, 200, validEntries[0].vector.length, "cosine");
			setIndex(idx);
			await idx.buildIndex(
				// @ts-expect-error
				validEntries.map(({ node, vector }) => {
					setMetaMap(node.postUri, node);
					vectorMap.set(node.postUri, vector);
					return { id: node.postUri, vector };
				}),
			);

			setSelected(validEntries[0].node.postUri);
			await exploreNode();
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

	const exploreNode = async () => {
		const id = selected();
		const idx = index();
		if (!idx || !id) return;

		const node = metaMap[id];
		if (!node) return;

		const vector = vectorMap.get(id);
		if (!vector) return;

		const query = await extractKeywords(node.postText, vector);
		const searchResult = await props.agent.app.bsky.feed.searchPosts({
			q: query,
			limit: 25,
		});

		const newEntries = await Promise.all(
			searchResult.data.posts
				.filter(
					(p) =>
						!vectorMap.has(p.uri) &&
						is(AppBskyFeedPost.mainSchema, p.record) &&
						p.record.text !== "",
				)
				.map(async (p) => {
					if (!is(AppBskyFeedPost.mainSchema, p.record)) return null;
					const record = p.record;
					const vector: number[] = Array.from(await getVec(record.text));
					const keywords = await extractKeywords(record.text, vector, 1);
					const n: GraphNode = {
						postUri: p.uri,
						did: p.author.did,
						avatarUrl: p.author.avatar!,
						postText: record.text,
						authorName: p.author.displayName!,
						createdAt: record.createdAt,
						keywords,
					};
					return { node: n, vector };
				}),
		);

		await addEntries(
			newEntries.filter(
				(e): e is { node: GraphNode; vector: number[] } => e !== null,
			),
		);

		const results = idx.searchKNN(vector, 51);
		const neighbors = results
			// @ts-expect-error
			.map((r) => r.id as string)
			.filter((nid) => nid !== id)
			.slice(0, 50);

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
