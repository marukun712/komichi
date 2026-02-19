import { AppBskyActorProfile, AppBskyFeedPost } from "@atcute/bluesky";
import { is, parseResourceUri } from "@atcute/lexicons";
import { isActorIdentifier } from "@atcute/lexicons/syntax";
import type { Agent } from "@atproto/api";
import { createSignal, For, onMount, Show } from "solid-js";
import { resolveProfile, resolveRecords } from "../lib/Resolver";
import { type Bit, getHash, getWeights, hammingDistance } from "../lib/SimHash";

export default function Posts(props: { agent: Agent }) {
	const [referenceHash, setReferenceHash] = createSignal<Bit[]>([]);
	const [visited, setVisited] = createSignal<string[]>([]);
	const [currentDid, setCurrentDid] = createSignal<string>("");
	const [foundPosts, setFoundPosts] = createSignal<
		{
			distance: number;
			did: string;
			profile: AppBskyActorProfile.Main;
			post: AppBskyFeedPost.Main;
		}[]
	>([]);
	const [isSearching, setIsSearching] = createSignal<boolean>(false);
	const [errorMessage, setErrorMessage] = createSignal<string>("");

	onMount(async () => {
		const posts = await props.agent.com.atproto.repo.listRecords({
			repo: props.agent.assertDid,
			collection: "app.bsky.feed.post",
		});

		const weights: number[][] = [];

		posts.data.records.forEach((r) => {
			if (is(AppBskyFeedPost.mainSchema, r.value)) {
				const text = r.value.text;
				const w = getWeights(text, 3);
				weights.push(...w);
			}
		});

		const h = getHash(weights);
		setReferenceHash(h);

		for (const record of posts.data.records) {
			if (is(AppBskyFeedPost.mainSchema, record.value)) {
				const reply = record.value.reply;
				if (is(AppBskyFeedPost.replyRefSchema, reply) && reply.parent?.uri) {
					const target = reply.parent.uri;
					const uri = parseResourceUri(target);
					if (uri.ok) {
						const did = uri.value.repo;
						setCurrentDid(did);
						break;
					}
				}
			}
		}

		if (!currentDid()) {
			setErrorMessage("リプライ先が見つかりませんでした");
		}
	});

	const searchNext = async () => {
		const did = currentDid();
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

			const posts = res;
			const distances: {
				uri: string;
				post: AppBskyFeedPost.Main;
				distance: number;
			}[] = [];

			for (const record of posts.data.records) {
				if (!is(AppBskyFeedPost.mainSchema, record.value)) continue;

				const text = record.value.text;

				if (!text) continue;

				const w = getWeights(text, 5);
				if (w.length === 0) continue;
				if (referenceHash().length === 0) continue;
				if (visited().includes(record.uri)) continue;

				const h = getHash(w);
				const distance = hammingDistance(referenceHash(), h);

				distances.push({ uri: record.uri, post: record.value, distance });
			}

			distances.sort((a, b) => a.distance - b.distance);

			if (distances[0]) {
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
						distance: distances[0].distance,
						did,
						profile: actorProfile,
						post: distances[0].post,
					},
				]);
				setVisited((prev) => [...prev, distances[0].uri]);
			}

			for (const record of posts.data.records) {
				if (!is(AppBskyFeedPost.mainSchema, record.value)) continue;
				const reply = record.value.reply;
				if (reply?.parent?.uri) {
					const uri = parseResourceUri(reply.parent.uri);
					if (!uri.ok) continue;
					setCurrentDid(uri.value.repo);
					break;
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
				<Show when={referenceHash().length > 0}>
					<p class="font-mono text-sm break-all">{referenceHash().join("")}</p>
				</Show>
			</div>
			<Show when={currentDid()}>
				<button type="button" onClick={searchNext} disabled={isSearching()}>
					{isSearching() ? "探索中..." : "次を探索"}
				</button>
			</Show>
			<Show when={errorMessage()}>
				<p class="text-red-500">{errorMessage()}</p>
			</Show>
			<Show when={foundPosts().length > 0}>
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
