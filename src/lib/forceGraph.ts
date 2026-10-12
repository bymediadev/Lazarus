export interface DependencyEdge {
  force: string;
  generates: string[];
}

export interface DependencyLoop {
  loop: string;
  forces: string[];
  effect: string;
}

export interface DependencyView {
  status: "edges" | "unavailable";
  edges: DependencyEdge[];
  loops: DependencyLoop[];
}

interface GraphInput {
  parent_forces?: { force?: string; generates?: string[] | null }[] | null;
  feedback_loops?: { loop?: string; forces?: string[] | null; effect?: string }[] | null;
}

function cleanList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

/**
 * Keep only edges that name both a parent and at least one child.
 * An empty generates list is missing data, not a relationship.
 */
export function dependencyRelationships(graph: GraphInput | null | undefined): DependencyView {
  if (!graph || typeof graph !== "object") {
    return { status: "unavailable", edges: [], loops: [] };
  }
  const edges = (Array.isArray(graph.parent_forces) ? graph.parent_forces : [])
    .map((parent) => ({
      force: String(parent?.force ?? "").trim(),
      generates: cleanList(parent?.generates),
    }))
    .filter((parent) => parent.force && parent.generates.length > 0);
  const loops = (Array.isArray(graph.feedback_loops) ? graph.feedback_loops : [])
    .map((loop) => ({
      loop: String(loop?.loop ?? "").trim(),
      forces: cleanList(loop?.forces),
      effect: String(loop?.effect ?? "").trim(),
    }))
    .filter((loop) => loop.loop && (loop.forces.length > 0 || loop.effect));
  if (edges.length === 0 && loops.length === 0) {
    return { status: "unavailable", edges: [], loops: [] };
  }
  return { status: "edges", edges, loops };
}

export const MISSING_DEPENDENCY_NOTE =
  "No dependency edges were established. A missing edge is not evidence that the forces are unrelated.";
