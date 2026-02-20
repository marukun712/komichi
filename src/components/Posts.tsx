import {
	AppBskyActorProfile,
	type AppBskyFeedPost,
	type AppBskyGraphFollow,
} from "@atcute/bluesky";
import { is } from "@atcute/lexicons";
import type { Agent } from "@atproto/api";
import type { DataArray } from "@huggingface/transformers";
import { createSignal, For, onMount, Show } from "solid-js";
import { cosineSimilarity, getVec } from "../lib/Embedding";
import {
	resolveAuthorFeed,
	resolveProfile,
	resolveRecords,
} from "../lib/Resolver";

function getRandomElements(arr: string[], n: number) {
	const shuffled = [...arr];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled.slice(0, n);
}

export default function Posts(props: { agent: Agent }) {
	let currentDid = "";
	let currentVec: DataArray | null = null;
	const visited: string[] = [];

	const [loaded, setLoaded] = createSignal<boolean>(false);
	const [foundPosts, setFoundPosts] = createSignal<
		{
			distance: number;
			did: string;
			profile: AppBskyActorProfile.Main;
			post: AppBskyFeedPost.Main;
		}[]
	>([]);
	const [myPosts, setMyPosts] = createSignal<AppBskyFeedPost.Main[]>([]);
	const [isSearching, setIsSearching] = createSignal<boolean>(false);
	const [errorMessage, setErrorMessage] = createSignal<string>("");

	onMount(async () => {
		const posts = await props.agent.com.atproto.repo.listRecords({
			repo: props.agent.assertDid,
			collection: "app.bsky.feed.post",
		});

		const records = posts.data.records.map(
			(r) => r.value as AppBskyFeedPost.Main,
		);

		setMyPosts(records);
	});

	const selectPost = async (post: AppBskyFeedPost.Main) => {
		currentVec = await getVec(post.text);
		currentDid = props.agent.assertDid;
		setLoaded(true);
		searchNext();
	};

	const getFollowDids = async (did: string): Promise<string[]> => {
		const res = await resolveRecords(did, "app.bsky.graph.follow");
		if (!res || !res.ok) return [];
		const dids = res.data.records
			.map((r) => (r.value as AppBskyGraphFollow.Main).subject)
			.filter((d) => !visited.includes(d));
		return getRandomElements(dids, 10);
	};

	const searchNext = async () => {
		if (!currentDid) {
			setErrorMessage("探索を続行できません");
			return;
		}

		setIsSearching(true);
		setErrorMessage("");

		try {
			const followDids = await getFollowDids(currentDid);
			if (followDids.length === 0) {
				setErrorMessage("探索できるフォローがありません");
				return;
			}

			const candidates = await Promise.all(
				followDids.map(async (did) => {
					const res = await resolveAuthorFeed(did);
					if (!res || !res.ok) return [];

					const records = await Promise.all(
						res.data.feed.map(async (record) => {
							if (!currentVec) return null;

							const post = record.post.record as AppBskyFeedPost.Main;
							const vec = await getVec(post.text);
							const distance = cosineSimilarity(currentVec, vec);

							return {
								did,
								post: record.post.record as AppBskyFeedPost.Main,
								distance,
							};
						}),
					);

					return records.filter((x) => x !== null);
				}),
			);

			const flat = candidates.flat();
			if (flat.length === 0) {
				setErrorMessage("候補が見つかりませんでした");
				return;
			}

			flat.sort((a, b) => b.distance - a.distance);
			const best = flat[0];

			const profile = await resolveProfile(best.did);
			if (
				!profile ||
				!profile.ok ||
				!is(AppBskyActorProfile.mainSchema, profile.data.value)
			) {
				setErrorMessage("プロフィールの取得に失敗しました");
				return;
			}

			setFoundPosts((prev) => [
				...prev,
				{
					distance: best.distance,
					did: best.did,
					profile: profile.data.value as AppBskyActorProfile.Main,
					post: best.post,
				},
			]);

			currentVec = await getVec(best.post.text);
			visited.push(best.did);
			currentDid = best.did;
		} catch (e) {
			console.error(e);
			setErrorMessage("投稿の取得に失敗しました");
		} finally {
			setIsSearching(false);
		}
	};

	return (
		<div class="space-y-4">
			<Show when={loaded()}>
				<button type="button" onClick={searchNext} disabled={isSearching()}>
					{isSearching() ? "探索中..." : "次を探索"}
				</button>
			</Show>
			<Show when={errorMessage()}>
				<p class="text-red-500">{errorMessage()}</p>
			</Show>
			<Show
				when={foundPosts().length > 0}
				fallback={
					<Show when={myPosts().length > 0 && !loaded()}>
						<div>
							<h2>自分の投稿から選択:</h2>
							<For each={myPosts()}>
								{(post) => (
									<button
										type="button"
										onClick={() => selectPost(post)}
										class="block w-full text-left p-2 border rounded mb-1 hover:bg-gray-100"
									>
										{post.text.slice(0, 50)}
										{post.text.length > 50 ? "..." : ""}
									</button>
								)}
							</For>
						</div>
					</Show>
				}
			>
				<div>
					<h2>見つけた投稿:</h2>
					<For each={foundPosts()}>
						{(item) => (
							<article>
								<header style="display:flex; gap:0.75rem; align-items:center;">
									<img
										// @ts-expect-error
										src={`https://cdn.bsky.app/img/avatar/plain/${item.did}/${item.profile.avatar?.ref.$link}`}
										alt={item.profile.displayName}
										width="60"
										height="60"
										style="border-radius:50%;"
									/>
									<div>
										<strong>{item.profile.displayName}</strong>
									</div>
								</header>
								<p style="white-space:pre-wrap;">{item.post.text}</p>
								<footer>
									<small>距離: {item.distance}</small>
								</footer>
							</article>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
