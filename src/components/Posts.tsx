import { AppBskyActorProfile, AppBskyFeedPost } from "@atcute/bluesky";
import { is, parseResourceUri } from "@atcute/lexicons";
import { isActorIdentifier } from "@atcute/lexicons/syntax";
import type { Agent } from "@atproto/api";
import { createSignal, For, onMount, Show } from "solid-js";
import { resolveProfile, resolveRecords } from "../lib/Resolver";
import { type Bit, getHash, getWeights, hammingDistance } from "../lib/SimHash";

export default function Posts(props: { agent: Agent }) {
	let currentDid = "";
	let currentHash: Bit[] = [];
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

		const records = posts.data.records
			.filter((r) => is(AppBskyFeedPost.mainSchema, r.value))
			.map((r) => r.value as AppBskyFeedPost.Main);

		setMyPosts(records);
	});

	const selectPost = (post: AppBskyFeedPost.Main) => {
		const text = post.text;
		currentHash = getHash(getWeights(text, 5));
		currentDid = props.agent.assertDid;
		setLoaded(true);
		searchNext();
	};

	const searchNext = async () => {
		const did = currentDid;
		if (!did) {
			setErrorMessage("探索を続行できません");
			return;
		}

		setIsSearching(true);
		setErrorMessage("");

		try {
			if (!isActorIdentifier(did)) {
				setErrorMessage("不正なDIDです");
				return;
			}

			const res = await resolveRecords(did, "app.bsky.feed.post");
			if (!res.ok) {
				setErrorMessage("投稿の取得に失敗しました");
				return;
			}

			const posts: {
				post: AppBskyFeedPost.Main;
				uri: string;
				distance: number;
			}[] = [];
			const replies: {
				post: AppBskyFeedPost.Main;
				uri: string;
				distance: number;
			}[] = [];

			for (const record of res.data.records) {
				if (!is(AppBskyFeedPost.mainSchema, record.value)) continue;

				const text = record.value.text;

				if (!text) continue;

				const w = getWeights(text, 5);

				if (w.length === 0) continue;
				if (currentHash.length === 0) continue;
				if (visited.includes(record.uri)) continue;

				const h = getHash(w);
				const distance = hammingDistance(currentHash, h);

				posts.push({ post: record.value, uri: record.uri, distance });

				if (record.value.reply) {
					replies.push({ post: record.value, uri: record.uri, distance });
				}
			}

			posts.sort((a, b) => a.distance - b.distance);
			replies.sort((a, b) => a.distance - b.distance);

			const bestPost = posts[0];
			const bestReply = replies[0];

			if (bestPost) {
				const profile = await resolveProfile(did);
				if (
					!profile.ok ||
					!is(AppBskyActorProfile.mainSchema, profile.data.value)
				) {
					setErrorMessage("プロフィールの取得に失敗しました");
					return;
				}
				const actorProfile = profile.data.value;
				setFoundPosts((prev) => [
					...prev,
					{
						distance: bestPost.distance,
						did,
						profile: actorProfile,
						post: bestPost.post,
					},
				]);
				visited.push(bestPost.uri);
			}

			if (bestReply) {
				const reply = bestReply.post.reply;
				if (reply?.parent?.uri) {
					const uri = parseResourceUri(reply.parent.uri);
					if (!uri.ok) return;
					currentDid = uri.value.repo;
					visited.push(bestReply.uri);
				}
			}
		} catch (e) {
			console.error(e);
			setErrorMessage("投稿の取得に失敗しました");
		} finally {
			setIsSearching(false);
		}
	};

	return (
		<div class="space-y-4">
			<div>
				<h1 class="text-xl font-bold">Your Hash:</h1>
				<Show when={loaded()}>
					<p class="font-mono text-sm break-all">{currentHash}</p>
				</Show>
			</div>
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
										<br />
									</div>
								</header>

								<p style="white-space:pre-wrap;">{item.post.text}</p>

								<footer>
									<small>
										<br />
										距離: {item.distance}
									</small>
								</footer>
							</article>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
