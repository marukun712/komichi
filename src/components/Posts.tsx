import type { AppBskyFeedPost } from "@atcute/bluesky";
import type { Agent } from "@atproto/api";
import { HNSW } from "hnsw";
import { createSignal, onMount, Show } from "solid-js";
import { getVec } from "../lib/Embedding";
import { resolveAuthorFeed } from "../lib/Resolver";
import GraphView from "./GraphView";

export type GraphNode = {
	postUri: string;
	did: string;
	avatarUrl: string;
	postText: string;
	authorName: string;
	createdAt: string;
};

export type GraphEdge = { from: number; to: number };

export default function Posts(props: { agent: Agent }) {
	const [isLoading, setIsLoading] = createSignal(false);
	const [errorMessage, setErrorMessage] = createSignal("");
	const [idx, setIdx] = createSignal<number | null>(null);
	const [nodes, setNodes] = createSignal<GraphNode[]>([]);
	const [edges, setEdges] = createSignal<GraphEdge[]>([]);

	let index: HNSW | null = null;
	const metaMap = new Map<number, GraphNode>();
	const vectorMap = new Map<number, number[]>();
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

			const feedItems = feed.data.feed.filter(
				(r) => (r.post.record.text as string) !== "",
			);

			const entries = await Promise.all(
				feedItems.map(async (item) => {
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

			index = new HNSW(16, 200, entries[0].vector.length, "cosine");
			await index.buildIndex(
				entries.map(({ node, vector }, i) => {
					metaMap.set(i, node);
					vectorMap.set(i, vector);
					return { id: i, vector };
				}),
			);

			const seed = entries[0].node;
			visited.add(seed.postUri);
			setNodes([seed]);
		} catch (e) {
			console.error(e);
			setErrorMessage("フィードの取得に失敗しました");
		} finally {
			setIsLoading(false);
		}
	});

	const selectNode = (idx: number) => {
		setIdx(idx);
	};

	const exploreNode = () => {
		if (!index) return;
		const n = idx();
		if (n === null || n === undefined) return;
		const vector = vectorMap.get(n);
		if (!vector) return;

		const results = index.searchKNN(vector, 6);
		const newNeighbors = results
			.map((r) => metaMap.get(r.id))
			.filter((n) => n && !visited.has(n.postUri))
			.filter((n) => n !== undefined)
			.slice(0, 5);

		if (newNeighbors.length === 0) return;

		const currentNodes = nodes();
		const newEdges = newNeighbors.map((_, i) => ({
			from: n,
			to: currentNodes.length + i,
		}));

		for (const n of newNeighbors) visited.add(n.postUri);
		setNodes([...currentNodes, ...newNeighbors]);
		setEdges([...edges(), ...newEdges]);
	};

	return (
		<div class="space-y-4">
			<Show when={errorMessage()}>
				<p class="text-red-500">{errorMessage()}</p>
			</Show>
			<Show when={isLoading()}>
				<p>読み込み中...</p>
			</Show>
			<Show when={nodes().length > 0}>
				<button type="button" onClick={exploreNode}>
					探索
				</button>
				<GraphView nodes={nodes()} edges={edges()} onNodeClick={selectNode} />
			</Show>
			<Show when={nodes()[idx()!]}>
				{(node) => {
					return (
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
					);
				}}
			</Show>
		</div>
	);
}
