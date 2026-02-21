import Graph from "graphology";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import panzoom from "panzoom";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import type { GraphNode, Index } from "./Posts";

type LayoutNode = { id: string; x: number; y: number };

export default function GraphView(props: {
	index: Index[];
	metaMap: Record<string, GraphNode>;
	onNodeClick: (id: string) => void;
}) {
	let containerRef!: HTMLDivElement;
	const g = new Graph();
	const layout = new FA2Layout(g, { settings: { gravity: 5 } });

	const [nodes, setNodes] = createSignal<LayoutNode[]>([]);

	onMount(() => {
		panzoom(containerRef);
	});

	createEffect(() => {
		for (const { from, to } of props.index) {
			if (!g.hasNode(from))
				g.addNode(from, {
					x: Math.random(),
					y: Math.random(),
				});
			for (const t of to) {
				if (!g.hasNode(t)) {
					const fp = g.getNodeAttributes(from);
					g.addNode(t, {
						x: fp.x + Math.random(),
						y: fp.y + Math.random(),
					});
				}
				if (!g.hasEdge(from, t)) {
					g.addEdge(from, t);
				}
			}
		}
		if (!layout.isRunning()) {
			layout.start();
			setTimeout(() => {
				const ns: LayoutNode[] = [];
				g.forEachNode((id, { x, y }) => ns.push({ id, x, y }));
				setNodes(ns);
				layout.stop();
			}, 3000);
		}
	});

	onCleanup(() => {
		layout.kill();
	});

	return (
		<div
			role="application"
			aria-label="投稿グラフビュー"
			style={{
				position: "relative",
				width: "100%",
				height: "600px",
				border: "1px solid #e2e8f0",
				overflow: "hidden",
			}}
		>
			<div
				ref={containerRef}
				style={{
					width: "800px",
					height: "600px",
					position: "relative",
				}}
			>
				<For each={nodes()}>
					{(n) => {
						const meta = props.metaMap[n.id];
						return (
							<Show when={meta}>
								{(m) => (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											props.onNodeClick(n.id);
										}}
										class="node"
										style={{
											position: "absolute",
											left: `${n.x * 30 + 400}px`,
											top: `${n.y * 30 + 300}px`,
											width: "30px",
											height: "30px",
											padding: "0",
											border: "none",
											background: "none",
											cursor: "pointer",
										}}
									>
										<img
											src={m().avatarUrl}
											alt={m().authorName}
											style={{
												width: "100%",
												height: "100%",
												"border-radius": "50%",
												display: "block",
											}}
										/>
									</button>
								)}
							</Show>
						);
					}}
				</For>
			</div>
		</div>
	);
}
