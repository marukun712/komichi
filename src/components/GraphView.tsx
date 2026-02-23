import * as d3 from "d3";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { GraphNode, Index } from "./AppView";

type SimNode = d3.SimulationNodeDatum & { id: string };
type SimLink = d3.SimulationLinkDatum<SimNode> & { rank: number };

const CARD_W = 120;
const CARD_H = 70;

export default function GraphView(props: {
  index: Index[];
  metaMap: Record<string, GraphNode>;
  onNodeClick: (id: string) => void;
}) {
  let svgRef!: SVGSVGElement;

  const [nodeSelection, setNodeSelection] = createSignal<d3.Selection<
    SVGGElement,
    SimNode,
    SVGGElement,
    unknown
  > | null>(null);

  const nodes: SimNode[] = [];
  const nodeIds = new Set<string>();
  const linkDefs: { from: string; to: string; rank: number }[] = [];

  createEffect(() => {
    let dirty = false;

    for (const { from, to } of props.index) {
      for (const id of [from, ...to]) {
        if (!nodeIds.has(id)) {
          nodeIds.add(id);
          nodes.push({ id });
          dirty = true;
        }
      }
      for (const [rank, t] of to.entries()) {
        if (!linkDefs.some((l) => l.from === from && l.to === t)) {
          linkDefs.push({ from, to: t, rank });
          dirty = true;
        }
      }
    }

    if (!dirty) return;

    const links: SimLink[] = linkDefs.map((l) => ({
      source: l.from,
      target: l.to,
      rank: l.rank,
    }));

    const svg = d3.select(svgRef);
    const prevTransform = d3.zoomTransform(svgRef);
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("transform", prevTransform.toString());
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .on("zoom", (e) => g.attr("transform", e.transform)),
    );

    const link = g.append("g").selectAll("line").data(links).join("line");

    const sel = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_, d) => props.onNodeClick(d.id));

    sel
      .append("foreignObject")
      .attr("width", CARD_W)
      .attr("height", CARD_H)
      .attr("x", -CARD_W / 2)
      .attr("y", -CARD_H / 2)
      .append("xhtml:div")
      .style("background", "white")
      .style("border", "1px solid #e2e8f0")
      .style("border-radius", "10px")
      .style("box-shadow", "0 2px 8px rgba(0,0,0,0.1)")
      .style("padding", "8px")
      .style("display", "flex")
      .style("gap", "8px")
      .style("align-items", "center")
      .style("height", "100%")
      .style("box-sizing", "border-box");

    setNodeSelection(sel);

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => 80 + l.rank * 20)
          .strength((l) => 1 / (1 + l.rank * 0.2)),
      )
      .force(
        "center",
        d3.forceCenter(svgRef.clientWidth / 2, svgRef.clientHeight / 2),
      )
      .force("collide", d3.forceCollide().radius(Math.max(CARD_W, CARD_H) / 1.5))
      .on("tick", () => {
        link
          .attr("x1", (d) => (d.source as SimNode).x ?? 0)
          .attr("y1", (d) => (d.source as SimNode).y ?? 0)
          .attr("x2", (d) => (d.target as SimNode).x ?? 0)
          .attr("y2", (d) => (d.target as SimNode).y ?? 0);
        nodeSelection()?.attr(
          "transform",
          (d) => `translate(${d.x ?? 0},${d.y ?? 0})`,
        );
      });

    onCleanup(() => sim.stop());
  });

  createEffect(() => {
    const sel = nodeSelection();
    if (!sel) return;
    const metaMap = props.metaMap;
    sel.each(function(d) {
      const m = metaMap[d.id];
      if (!m) return;
      const div = d3.select(this).select<HTMLDivElement>("foreignObject div");
      if (div.empty()) return;
      const text =
        m.postText.slice(0, 15) + (m.postText.length > 15 ? "…" : "");
      div.html(`
				<img src="${m.avatarUrl}" style="width:32px;height:32px;border-radius:50%;flex-shrink:0" />
				<div style="overflow:hidden">
					<div style="font-weight:bold;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.keywords}</div>
					<div style="font-size:10px;color:#6b7280;margin-top:2px;line-height:1.3">${text}</div>
				</div>
			`);
    });
  });

  return (
    <svg
      ref={svgRef}
      role="application"
      aria-label="投稿グラフビュー"
      style={{ width: "100%", height: "600px" }}
    />
  );
}
