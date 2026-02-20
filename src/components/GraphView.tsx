import {
	forceCenter,
	forceLink,
	forceManyBody,
	forceSimulation,
} from "d3-force";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type { GraphEdge, GraphNode } from "./Posts";

interface GraphViewProps {
	nodes: GraphNode[];
	edges: GraphEdge[];
	onNodeClick?: (index: number) => void;
}

type D3Node = { index: number; x: number; y: number };

export default function GraphView(props: GraphViewProps) {
	let containerRef: HTMLDivElement | undefined;
	const [positions, setPositions] = createSignal<{ x: number; y: number }[]>(
		[],
	);
	const [transform, setTransform] = createSignal({ x: 0, y: 0, scale: 1 });
	const [isDragging, setIsDragging] = createSignal(false);
	const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });

	const d3Nodes: D3Node[] = [];
	const simulation = forceSimulation<D3Node>()
		.force(
			"link",
			forceLink<D3Node, { source: number; target: number }>()
				.id((d) => d.index)
				.distance(100),
		)
		.force("charge", forceManyBody().strength(-200))
		.force("center", forceCenter(400, 300))
		.on("tick", () => setPositions(d3Nodes.map((n) => ({ x: n.x, y: n.y }))));

	onCleanup(() => simulation.stop());

	createEffect(() => {
		const n = props.nodes.length;
		while (d3Nodes.length < n) {
			d3Nodes.push({ index: d3Nodes.length, x: 400, y: 300 });
		}
		simulation
			.force("link")
			// @ts-expect-error
			?.links(props.edges.map((e) => ({ source: e.from, target: e.to })));
		simulation.nodes(d3Nodes).alpha(0.3).restart();
	});

	createEffect(() => {
		if (!containerRef || props.nodes.length === 0) return;
		if (transform().x !== 0 || transform().y !== 0 || transform().scale !== 1)
			return;
		const { clientWidth: w, clientHeight: h } = containerRef;
		setTransform({ x: (w - 800) / 2, y: (h - 600) / 2, scale: 1 });
	});

	const handleWheel = (e: WheelEvent) => {
		e.preventDefault();
		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		const newScale = Math.max(0.1, Math.min(5, transform().scale * delta));
		const worldX = (mouseX - transform().x) / transform().scale;
		const worldY = (mouseY - transform().y) / transform().scale;
		setTransform({
			x: mouseX - worldX * newScale,
			y: mouseY - worldY * newScale,
			scale: newScale,
		});
	};

	const handleMouseDown = (e: MouseEvent) => {
		setIsDragging(true);
		setDragStart({
			x: e.clientX - transform().x,
			y: e.clientY - transform().y,
		});
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!isDragging()) return;
		setTransform((t) => ({
			...t,
			x: e.clientX - dragStart().x,
			y: e.clientY - dragStart().y,
		}));
	};

	return (
		<div
			ref={containerRef}
			role="application"
			aria-label="投稿グラフビュー"
			onWheel={handleWheel}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={() => setIsDragging(false)}
			onMouseLeave={() => setIsDragging(false)}
			style={{
				position: "relative",
				width: "100%",
				height: "600px",
				border: "1px solid #e2e8f0",
				overflow: "hidden",
				cursor: isDragging() ? "grabbing" : "grab",
			}}
		>
			<div
				style={{
					transform: `translate(${transform().x}px, ${transform().y}px) scale(${transform().scale})`,
					"transform-origin": "0 0",
					width: "800px",
					height: "600px",
					position: "relative",
				}}
			>
				<For each={props.nodes}>
					{(node, index) => {
						const pos = () => positions()[index()];
						return (
							<Show when={pos()}>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										props.onNodeClick?.(index());
									}}
									style={{
										position: "absolute",
										left: `${pos().x}px`,
										top: `${pos().y}px`,
										width: "30px",
										height: "30px",
										padding: "0",
										border: "none",
										background: "none",
										cursor: "pointer",
									}}
								>
									<img
										src={node.avatarUrl}
										alt={node.authorName}
										style={{
											width: "100%",
											height: "100%",
											"border-radius": "50%",
											display: "block",
										}}
									/>
								</button>
							</Show>
						);
					}}
				</For>
			</div>
		</div>
	);
}
