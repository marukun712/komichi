import type { AppBskyActorProfile, AppBskyFeedPost } from "@atcute/bluesky";
import { createEffect, createSignal, For } from "solid-js";

interface GraphViewProps {
	posts: {
		distance: number;
		did: string;
		profile: AppBskyActorProfile.Main;
		post: AppBskyFeedPost.Main;
	}[];
	onNodeClick?: (index: number) => void;
	selectedIndex?: number;
}

export default function GraphView(props: GraphViewProps) {
	let containerRef: HTMLDivElement | undefined;

	const [nodePositions, setNodePositions] = createSignal<
		{ index: number; did: string; x: number; y: number; avatarUrl: string }[]
	>([]);

	const [transform, setTransform] = createSignal({
		x: 0,
		y: 0,
		scale: 1,
	});

	const [isDragging, setIsDragging] = createSignal(false);
	const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });

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

	createEffect(() => {
		if (!containerRef) return;

		const posts = props.posts;
		if (posts.length === 0) {
			setNodePositions([]);
			return;
		}

		const width = containerRef.clientWidth;
		const height = containerRef.clientHeight;
		const centerX = width / 2;
		const centerY = height / 2;
		const maxRadius = Math.min(width, height);

		const positions = posts.map((post, index) => {
			const angle = Math.random() * 2 * Math.PI;
			const radius = (1 - post.distance) ** 2 * 10 * maxRadius;
			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);

			return {
				index,
				did: post.did,
				x,
				y,
				avatarUrl: `https://cdn.bsky.app/img/avatar/plain/${post.did}/${
					// @ts-expect-error
					post.profile.avatar?.ref.$link
				}`,
			};
		});

		setNodePositions(positions);
	});

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
				<For each={nodePositions()}>
					{(node) => {
						const isSelected = () => node.index === props.selectedIndex;
						return (
							<button
								type="button"
								onClick={() => props.onNodeClick?.(node.index)}
								onMouseDown={(e) => e.stopPropagation()}
								style={{
									position: "absolute",
									left: `${node.x}px`,
									top: `${node.y}px`,
									width: "30px",
									height: "30px",
									padding: "0",
									background: "none",
									border: isSelected() ? "3px solid #3b82f6" : "none",
									"border-radius": "50%",
									cursor: "pointer",
									"box-shadow": isSelected()
										? "0 0 10px rgba(59, 130, 246, 0.5)"
										: "none",
								}}
							>
								<img
									src={node.avatarUrl}
									alt=""
									style={{
										width: "100%",
										height: "100%",
										"border-radius": "50%",
										display: "block",
									}}
								/>
							</button>
						);
					}}
				</For>
			</div>
		</div>
	);
}
