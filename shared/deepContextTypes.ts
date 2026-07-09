export interface VetoHolderRef {
  veto_holder_id: string;
  display_name: string;
}

export interface HistoricalCrmContextEntry {
  date: string;
  stage: string;
  past_identified_veto_holders: VetoHolderRef[];
  past_logged_objections: string[];
}

function slugifyVetoHolderId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return slug || "unknown";
}

/** Normalize legacy string[] or new object[] veto-holder formats. */
export function normalizeVetoHolders(value: unknown): VetoHolderRef[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: VetoHolderRef[] = [];

  for (const item of value) {
    let ref: VetoHolderRef | null = null;

    if (typeof item === "string") {
      const display_name = item.trim();
      if (!display_name) continue;
      ref = {
        veto_holder_id: slugifyVetoHolderId(display_name),
        display_name,
      };
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const display_name = String(o.display_name ?? o.name ?? "").trim();
      const veto_holder_id =
        String(o.veto_holder_id ?? "").trim() ||
        (display_name ? slugifyVetoHolderId(display_name) : "");
      if (!display_name && !veto_holder_id) continue;
      ref = {
        veto_holder_id: veto_holder_id || slugifyVetoHolderId(display_name),
        display_name: display_name || veto_holder_id,
      };
    }

    if (ref && !seen.has(ref.veto_holder_id)) {
      seen.add(ref.veto_holder_id);
      result.push(ref);
    }
  }

  return result;
}
