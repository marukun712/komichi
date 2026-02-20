import type { AppBskyFeedPost } from "@atcute/bluesky";
import type { Agent, AppBskyActorProfile } from "@atproto/api";
// @ts-expect-error
import * as druid from "@saehrimnir/druidjs";
import { createSignal, onMount, Show } from "solid-js";
import { cosineSimilarity, getVec } from "../lib/Embedding";
import { resolveAuthorFeed, resolveProfile } from "../lib/Resolver";
import GraphView from "./GraphView";

interface DruidMatrix {
	_rows: number;
	_cols: number;
	_data: Float64Array;
}

function extractMDSCoordinates(
	mdsMatrix: DruidMatrix,
): { x: number; y: number }[] {
	const rows = mdsMatrix._rows;
	const data = mdsMatrix._data;

	const coords: { x: number; y: number }[] = [];
	for (let i = 0; i < rows; i++) {
		coords.push({
			x: data[i],
			y: data[rows + i],
		});
	}
	return coords;
}

function generateNodes(matrix: number[][]) {
	const parsed = druid.Matrix.from(matrix);
	const mds = new druid.MDS(parsed, {
		d: 2,
		metric: "precomputed",
	});
	const coords = mds.transform();

	const rawCoords = extractMDSCoordinates(coords);

	const xValues = rawCoords.map((c) => c.x);
	const yValues = rawCoords.map((c) => c.y);
	const minX = Math.min(...xValues);
	const maxX = Math.max(...xValues);
	const minY = Math.min(...yValues);
	const maxY = Math.max(...yValues);

	const rangeX = maxX - minX;
	const rangeY = maxY - minY;
	if (
		rangeX === 0 ||
		rangeY === 0 ||
		!Number.isFinite(rangeX) ||
		!Number.isFinite(rangeY)
	) {
		throw new Error("座標の計算に失敗しました");
	}

	const VIEWPORT_WIDTH = 800;
	const VIEWPORT_HEIGHT = 600;
	const PADDING = 50;

	const scaleX = (VIEWPORT_WIDTH - 2 * PADDING) / rangeX;
	const scaleY = (VIEWPORT_HEIGHT - 2 * PADDING) / rangeY;
	const scale = Math.min(scaleX, scaleY);

	const normalizedCoords = rawCoords.map((coord) => ({
		x: PADDING + (coord.x - minX) * scale,
		y: PADDING + (coord.y - minY) * scale,
	}));

	return normalizedCoords;
}

export default function Posts(props: { agent: Agent }) {
	const [currentDid, setCurrentDid] = createSignal("");
	const [isSearching, setIsSearching] = createSignal<boolean>(false);
	const [errorMessage, setErrorMessage] = createSignal<string>("");
	const [selectedNodeIndex, setSelectedNodeIndex] = createSignal<number | null>(
		null,
	);
	const [mdsNodes, setMdsNodes] = createSignal<
		{
			did: string;
			x: number;
			y: number;
			avatarUrl: string;
			postText: string;
			authorName: string;
			createdAt: string;
			postUri: string;
		}[]
	>([]);

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
			const feed = await resolveAuthorFeed(currentDid());
			if (!feed || !feed.ok) {
				setErrorMessage("フィードの取得に失敗しました");
				return;
			}

			const feedItems = feed.data.feed
				.filter((r) => r.post.author.did !== currentDid())
				.filter((r) => (r.post.record.text as string) !== "");

			const parsedFeed = feedItems.map((r) => r.post.record.text as string);

			const myPostsResult = await props.agent.com.atproto.repo.listRecords({
				repo: currentDid(),
				collection: "app.bsky.feed.post",
			});

			const myProfile = await resolveProfile(currentDid());
			if (!myProfile || !myProfile.ok) {
				setErrorMessage("プロフィールの取得に失敗しました");
				return;
			}

			const profile = myProfile.data.value as AppBskyActorProfile.Main;

			const myPosts = myPostsResult.data.records
				.map((r) => r.value as AppBskyFeedPost.Main)
				.filter((r) => r.text !== "")
				.slice(0, parsedFeed.length);

			const myPostRecords = myPostsResult.data.records
				.filter((r) => (r.value as AppBskyFeedPost.Main).text !== "")
				.slice(0, parsedFeed.length);

			const allTexts = [...myPosts.map((r) => r.text), ...parsedFeed];

			const allEmbeddings = await Promise.all(
				allTexts.map((text) => getVec(text)),
			);

			const n = allEmbeddings.length;
			const distanceMatrix: number[][] = [];
			for (let i = 0; i < n; i++) {
				const row: number[] = [];
				for (let j = 0; j < n; j++) {
					row.push(1 - cosineSimilarity(allEmbeddings[i], allEmbeddings[j]));
				}
				distanceMatrix.push(row);
			}

			const allCoords = generateNodes(distanceMatrix);

			const myCount = myPosts.length;

			const myNodes = allCoords.slice(0, myCount).map((coord, i) => ({
				did: currentDid(),
				x: coord.x,
				y: coord.y,
				// @ts-expect-error
				avatarUrl: `https://cdn.bsky.app/img/avatar/plain/${currentDid()}/${profile.avatar?.ref.$link}`,
				postText: myPosts[i].text,
				authorName: profile.displayName!,
				createdAt: myPosts[i].createdAt,
				postUri: myPostRecords[i].uri,
				isOwn: true,
			}));

			const feedNodes = allCoords.slice(myCount).map((coord, i) => {
				const feedItem = feedItems[i];
				const profile = feedItem.post.author;
				const record = feedItem.post.record as AppBskyFeedPost.Main;
				return {
					did: profile.did,
					x: coord.x,
					y: coord.y,
					avatarUrl: profile.avatar!,
					postText: record.text,
					authorName: profile.displayName!,
					createdAt: record.createdAt,
					postUri: feedItem.post.uri,
					isOwn: false,
				};
			});

			setMdsNodes([...myNodes, ...feedNodes]);
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
			<Show when={mdsNodes().length > 0}>
				<GraphView
					nodes={mdsNodes()}
					onNodeClick={(index: number) => setSelectedNodeIndex(index)}
				/>
			</Show>
			<Show when={selectedNodeIndex() !== null}>
				{(() => {
					const node = mdsNodes()[selectedNodeIndex()!];
					return (
						<article>
							<header>
								<hgroup>
									<h3>{node.authorName}</h3>
								</hgroup>
							</header>
							<p>{node.postText}</p>
							<footer>
								<small>
									{new Date(node.createdAt).toLocaleString("ja-JP")}
								</small>
							</footer>
						</article>
					);
				})()}
			</Show>
		</div>
	);
}
