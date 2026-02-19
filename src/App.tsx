import type { Component } from "solid-js";
import Login from "./components/Login";

const App: Component = () => {
	return (
		<div class="container space-y-4 py-12">
			<Login />
		</div>
	);
};

export default App;
