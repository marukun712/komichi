import { Agent } from "@atproto/api";
import { BrowserOAuthClient } from "@atproto/oauth-client-browser";
import { createSignal, onMount, Show } from "solid-js";
import Posts from "./Posts";

export default function Login() {
	const [handle, setHandle] = createSignal<string>("");
	const [client, setClient] = createSignal<BrowserOAuthClient | null>(null);
	const [agent, setAgent] = createSignal<Agent | null>(null);

	onMount(async () => {
		const client = await BrowserOAuthClient.load({
			clientId: `http://localhost?scope=atproto%20transition%3Ageneric&redirect_uri=${encodeURIComponent(`http://127.0.0.1:3000/`)}`,
			handleResolver: "https://bsky.social",
		});

		setClient(client);

		const result = await client.init();

		if (result) {
			const { session, state } = result;
			if (state != null) {
				console.log(
					`${session.sub} was successfully authenticated (state: ${state})`,
				);
				const agent = new Agent(session);
				setAgent(agent);
			} else {
				console.log(`${session.sub} was restored (last active session)`);
				const agent = new Agent(session);
				setAgent(agent);
			}
		}
	});

	const onSubmit = async () => {
		const c = client();
		if (!c) return;
		try {
			await c.signIn(handle(), {
				state: crypto.randomUUID(),
				signal: new AbortController().signal,
			});
			console.log("Never executed");
		} catch (e) {
			console.error(e);
			console.error(
				'The user aborted the authorization process by navigating "back"',
			);
		}
	};

	return (
		<Show
			when={agent()}
			fallback={
				<form
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<fieldset>
						<input
							name="handle"
							value={handle()}
							placeholder="Enter your handle..."
							onInput={(e) => setHandle(e.currentTarget.value)}
						/>
					</fieldset>

					<button type="submit">Login</button>
				</form>
			}
		>
			{(a) => <Posts agent={a()} />}
		</Show>
	);
}
