import { createEffect, createSignal, For } from "solid-js";

interface GraphViewProps {
	nodes: {
		did: string;
		x: number;
		y: number;
		avatarUrl: string;
		postText: string;
		authorName: string;
		createdAt: string;
		postUri: string;
	}[];
	onNodeClick?: (index: number) => void;
}

export default function GraphView(props: GraphViewProps) {
	let containerRef: HTMLDivElement | undefined;

	const [transform, setTransform] = createSignal({
		x: 0,
		y: 0,
		scale: 1,
	});

	const [isDragging, setIsDragging] = createSignal(false);
	const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });

	createEffect(() => {
		if (!containerRef || props.nodes.length === 0) return;

		const width = containerRef.clientWidth;
		const height = containerRef.clientHeight;
		if (width === 0 || height === 0) return;

		if (transform().x !== 0 || transform().y !== 0 || transform().scale !== 1)
			return;

		setTransform({
			x: (width - 800) / 2,
			y: (height - 600) / 2,
			scale: 1,
		});
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

		const newX = mouseX - worldX * newScale;
		const newY = mouseY - worldY * newScale;

		setTransform({
			x: newX,
			y: newY,
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

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	return (
		<div
			ref={containerRef}
			role="application"
			aria-label="投稿グラフビュー"
			onWheel={handleWheel}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
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
					width: "100%",
					height: "100%",
					position: "relative",
				}}
			>
				<For each={props.nodes}>
					{(node, index) => (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								props.onNodeClick?.(index());
							}}
							style={{
								position: "absolute",
								left: `${node.x}px`,
								top: `${node.y}px`,
								width: "30px",
								height: "30px",
								transform: "translate(-15px, -15px)",
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
					)}
				</For>
			</div>
		</div>
	);
}
