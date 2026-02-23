import { AppBskyActorProfile, AppBskyFeedPost } from "@atcute/bluesky";
import {
	is,
	isResourceUri,
	parseResourceUri,
	type ResourceUri,
} from "@atcute/lexicons";
import type { Agent } from "@atproto/api";
import { createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { BlueMarilKomichiIndex } from "../lexicons";
import { resolvePost, resolveProfile, resolveRecords } from "../lib/Resolver";
import type { GraphNode, Index } from "./AppView";
import GraphView from "./GraphView";

export default function PDSMode(props: { agent: Agent }) {
	const [isLoading, setIsLoading] = createSignal(false);
	const [errorMessage, setErrorMessage] = createSignal("");

	const [selected, setSelected] = createSignal<string | null>(null);
	const [graphIndex, setGraphIndex] = createSignal<Index[]>([]);

	const [metaMap, setMetaMap] = createStore<Record<string, GraphNode>>();

	const visited = new Set<string>();

	const getGraph = async (did: string) => {
		setIsLoading(true);
		const index = await resolveRecords(did, "blue.maril.komichi.index");
		if (!index || !index.ok) {
			setErrorMessage("インデックスの取得に失敗しました");
			return;
		}
		if (index.data.records.length === 0) {
			setErrorMessage("そのユーザーはインデックスを持っていません");
			return;
		}
		if (visited.has(did)) {
			setErrorMessage("そのユーザーのインデックスはすでに取得しています");
			return;
		}

		const flat: ResourceUri[] = [];

		const parsed = index.data.records
			.map((i) => {
				if (!is(BlueMarilKomichiIndex.mainSchema, i.value)) {
					return null;
				}
				const uri = parseResourceUri(i.uri);
				if (!uri.ok) {
					return null;
				}
				flat.push(i.uri);
				return {
					from: i.uri,
					to: i.value.subjects
						.filter((u) => isResourceUri(u))
						.map((u) => {
							flat.push(u);
							return u;
						}),
				};
			})
			.filter((i) => i !== null);

		await Promise.all(
			flat.map(async (u) => {
				const uri = parseResourceUri(u);
				if (!uri.ok || !uri.value.rkey) {
					return null;
				}
				const record = await resolvePost(uri.value.repo, uri.value.rkey);
				if (
					!record ||
					!record.ok ||
					!is(AppBskyFeedPost.mainSchema, record.data.value)
				) {
					return null;
				}
				const profile = await resolveProfile(uri.value.repo);
				if (
					!profile ||
					!profile.ok ||
					!is(AppBskyActorProfile.mainSchema, profile.data.value)
				) {
					return null;
				}

				setMetaMap(u, {
					postUri: u,
					did: uri.value.repo,
					// @ts-expect-error
					avatarUrl: `https://cdn.bsky.app/img/avatar/plain/${uri.value.repo}/${profile.data.value.avatar.ref.$link}`,
					postText: record.data.value.text,
					authorName: profile.data.value.displayName!,
					createdAt: record.data.value.createdAt,
				});
			}),
		);

		if (!parsed.length) return;
		const selected = parsed[0]?.from;

		setGraphIndex((prev) => [...prev, ...parsed]);
		setSelected(selected);
		visited.add(selected);
		setIsLoading(false);
	};

	onMount(async () => {
		await getGraph(props.agent.assertDid);
	});

	const selectNode = (id: string) => {
		setSelected(id);
	};

	const selectedNode = () => {
		const id = selected();
		return id ? metaMap[id] : undefined;
	};

	const exploreNode = () => {
		const id = selected();
		if (!id) return;
		const uri = parseResourceUri(id);
		if (!uri.ok) {
			return null;
		}
		getGraph(uri.value.repo);
	};

	return (
		<div class="space-y-4">
			<Show when={errorMessage()}>
				<p>{errorMessage()}</p>
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
