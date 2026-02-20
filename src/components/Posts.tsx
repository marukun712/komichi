import type { AppBskyActorProfile, AppBskyFeedPost } from "@atcute/bluesky";
import type { Agent } from "@atproto/api";
import type { DataArray } from "@huggingface/transformers";
import { createSignal, For, onMount, Show } from "solid-js";
import { cosineSimilarity, getVec } from "../lib/Embedding";
import { resolveAuthorFeed, resolveProfile } from "../lib/Resolver";

export default function Posts(props: { agent: Agent }) {
	let currentDid = "";
	let currentVec: DataArray | null = null;
	const profileCache = new Map<string, AppBskyActorProfile.Main>();

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

		const records = posts.data.records
			.map((r) => r.value as AppBskyFeedPost.Main)
			.filter((r) => r.text !== "");

		setMyPosts(records);
	});

	const selectPost = async (post: AppBskyFeedPost.Main) => {
		currentVec = await getVec(post.text);
		currentDid = props.agent.assertDid;
		setLoaded(true);
		searchNext();
	};

	const searchNext = async () => {
		if (isSearching()) return;

		if (!currentDid) {
			setErrorMessage("探索を続行できません");
			return;
		}

		setIsSearching(true);
		setErrorMessage("");

		try {
			const posts = await resolveAuthorFeed(currentDid);
			if (!posts || !posts.ok) {
				throw new Error("タイムラインを取得できませんでした");
			}
			const records = await Promise.all(
				posts.data.feed
					.filter((e) => e.post.author.did !== currentDid)
					.map(async (record) => {
						if (!currentVec) return null;

						const post = record.post.record as AppBskyFeedPost.Main;
						const vec = await getVec(post.text);
						const distance = cosineSimilarity(currentVec, vec);
						return {
							did: record.post.author.did,
							post: record.post.record as AppBskyFeedPost.Main,
							distance,
						};
					}),
			);

			const flat = records.flat().filter((e) => e !== null);
			if (flat.length === 0) {
				setErrorMessage("候補が見つかりませんでした");
				return;
			}

			flat.sort((a, b) => b.distance - a.distance);
			const best = flat[0];

			const newPosts = await Promise.all(
				flat.slice(0, 50).map(async (e) => {
					let profile: AppBskyActorProfile.Main;
					const has = profileCache.get(e.did);
					if (has) {
						profile = has;
					} else {
						const res = await resolveProfile(e.did);
						if (!res || !res.ok) {
							setErrorMessage("プロフィールの取得に失敗しました");
							return null;
						}
						profile = res.data.value as AppBskyActorProfile.Main;
						profileCache.set(e.did, profile);
					}
					return {
						distance: e.distance,
						did: e.did,
						profile,
						post: e.post,
					};
				}),
			);

			setFoundPosts(newPosts.filter((e) => e !== null));

			currentVec = await getVec(best.post.text);
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
