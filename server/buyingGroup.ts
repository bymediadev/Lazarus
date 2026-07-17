/**
 * First-class buying-group alignment: infer missing roles (quiet stakeholders),
 * not only personas that already appear on the call.
 */

export type BuyingGroupRole =
  | "champion"
  | "economic_buyer"
  | "technical_veto"
  | "procurement";

export type BuyingGroupStatus = "ALIGNED" | "PARTIAL" | "MISSING";

export interface BuyingGroupRolePresence {
  role: BuyingGroupRole;
  label: string;
  present: boolean;
  quiet: boolean;
  holder: string | null;
  evidence: string | null;
  inferred: boolean;
}

export interface BuyingGroupAlignment {
  status: BuyingGroupStatus;
  summary: string;
  expected_roles: BuyingGroupRole[];
  present_roles: BuyingGroupRole[];
  missing_roles: BuyingGroupRole[];
  quiet_stakeholders: string[];
  roles: BuyingGroupRolePresence[];
  confidence: number;
  evidence: string[];
}

export interface BuyingGroupStakeholderInput {
  name: string;
  role?: string;
  persona_type?: string;
  stance?: string;
  authority_level?: string;
  evidence?: string;
}

const ROLE_META: Record<BuyingGroupRole, { label: string; keywords: string[] }> = {
  champion: {
    label: "Champion",
    keywords: ["champion", "sponsor", "director", "manager", "ops", "operations", "owner"],
  },
  economic_buyer: {
    label: "Economic buyer",
    keywords: [
      "cfo",
      "ceo",
      "coo",
      "vp",
      "vice president",
      "economic",
      "budget owner",
      "signing",
      "signer",
      "executive",
      "buyer",
    ],
  },
  technical_veto: {
    label: "Technical / security veto",
    keywords: [
      "security",
      "infosec",
      "info sec",
      "infrastructure",
      "architect",
      "cto",
      "it ",
      " technical",
      "veto",
      "engineering",
      "data residency",
    ],
  },
  procurement: {
    label: "Procurement / legal",
    keywords: ["procurement", "legal", "purchasing", "vendor", "contract", "compliance", "po "],
  },
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function personaOf(s: BuyingGroupStakeholderInput): string {
  return normalize(s.persona_type ?? s.stance ?? "");
}

function blobOf(s: BuyingGroupStakeholderInput): string {
  return normalize(`${s.name} ${s.role ?? ""} ${s.authority_level ?? ""} ${s.evidence ?? ""}`);
}

function matchesRole(s: BuyingGroupStakeholderInput, role: BuyingGroupRole): boolean {
  const blob = blobOf(s);
  const persona = personaOf(s);
  const auth = normalize(s.authority_level ?? "");

  if (role === "champion") {
    if (persona.includes("aligned champion") || persona.includes("suppressed champion")) return true;
    return ROLE_META.champion.keywords.some((k) => blob.includes(k));
  }
  if (role === "economic_buyer") {
    if (auth.includes("economic") || auth.includes("buyer")) return true;
    if (persona.includes("absent decision maker") && /cfo|ceo|vp|budget|signing/.test(blob)) {
      return true;
    }
    return ROLE_META.economic_buyer.keywords.some((k) => blob.includes(k));
  }
  if (role === "technical_veto") {
    if (auth.includes("technical") || auth.includes("veto")) return true;
    if (persona.includes("hidden detractor") || persona.includes("absent decision maker")) {
      if (ROLE_META.technical_veto.keywords.some((k) => blob.includes(k))) return true;
    }
    return ROLE_META.technical_veto.keywords.some((k) => blob.includes(k));
  }
  if (role === "procurement") {
    return ROLE_META.procurement.keywords.some((k) => blob.includes(k));
  }
  return false;
}

function isQuiet(s: BuyingGroupStakeholderInput): boolean {
  const persona = personaOf(s);
  return (
    persona.includes("absent") ||
    persona.includes("hidden") ||
    persona.includes("suppressed") ||
    /missed|not on (this )?call|absent|didn't join|did not join|no-show|no show/i.test(
      s.evidence ?? ""
    )
  );
}

function stageNeedsProcurement(stage: string | undefined): boolean {
  const s = normalize(stage ?? "");
  return /contract|negotiat|legal|procurement|close|closed|proposal|quote|closedwon|closed won/.test(
    s
  );
}

function stageNeedsEconomicBuyer(stage: string | undefined): boolean {
  const s = normalize(stage ?? "");
  if (!s) return true;
  return !/early|lead|mql|sql|awareness|intro|discovery only/.test(s);
}

/**
 * Infer buying-group completeness from stakeholders + optional CRM stage.
 * Missing roles are inferred even when never named on the call.
 */
export function computeBuyingGroupAlignment(
  stakeholders: BuyingGroupStakeholderInput[],
  options?: { dealStage?: string; signalsMissed?: string[] }
): BuyingGroupAlignment {
  const stage = options?.dealStage;
  const expected: BuyingGroupRole[] = ["champion", "economic_buyer", "technical_veto"];
  if (stageNeedsProcurement(stage)) expected.push("procurement");

  const roles: BuyingGroupRolePresence[] = expected.map((role) => {
    const holders = stakeholders.filter((s) => matchesRole(s, role));
    const presentHolder = holders.find((s) => !isQuiet(s)) ?? holders[0] ?? null;
    const present = holders.length > 0;
    const quiet = present && holders.every((s) => isQuiet(s));
    const evidence = presentHolder?.evidence?.trim() || null;

    return {
      role,
      label: ROLE_META[role].label,
      present,
      quiet,
      holder: presentHolder?.name ?? null,
      evidence,
      inferred: !present || quiet,
    };
  });

  const present_roles = roles.filter((r) => r.present && !r.quiet).map((r) => r.role);
  const missing_roles = roles
    .filter((r) => !r.present || r.quiet)
    .map((r) => r.role);
  const quiet_stakeholders = [
    ...new Set(
      stakeholders.filter(isQuiet).map((s) => s.name.trim()).filter(Boolean)
    ),
  ];

  // Stage-conditioned: before contract, missing economic buyer is critical;
  // at/after contract, missing procurement is critical.
  if (stageNeedsEconomicBuyer(stage) && !present_roles.includes("economic_buyer")) {
    if (!missing_roles.includes("economic_buyer")) missing_roles.push("economic_buyer");
  }

  const signals = (options?.signalsMissed ?? []).map(normalize);
  for (const signal of signals) {
    if (/buying.?group|decision.?maker|economic|authority|champion/.test(signal)) {
      if (!missing_roles.includes("economic_buyer") && !present_roles.includes("economic_buyer")) {
        missing_roles.push("economic_buyer");
      }
    }
    if (/security|technical|architect|infrastructure|veto/.test(signal)) {
      if (!missing_roles.includes("technical_veto") && !present_roles.includes("technical_veto")) {
        missing_roles.push("technical_veto");
      }
    }
  }

  let status: BuyingGroupStatus = "ALIGNED";
  if (missing_roles.length === 0) status = "ALIGNED";
  else if (present_roles.length === 0 || missing_roles.length >= 2) status = "MISSING";
  else status = "PARTIAL";

  const evidence = roles
    .filter((r) => r.evidence)
    .map((r) => `${r.label}: "${r.evidence}"`)
    .slice(0, 4);

  if (!evidence.length && quiet_stakeholders.length) {
    evidence.push(`Quiet / absent stakeholders: ${quiet_stakeholders.join(", ")}`);
  }

  const missingLabels = roles
    .filter((r) => missing_roles.includes(r.role))
    .map((r) => (r.quiet && r.holder ? `${r.label} (${r.holder} quiet)` : r.label));

  const summary =
    status === "ALIGNED"
      ? "Buying group looks complete for this stage — champion and key veto roles are present."
      : status === "PARTIAL"
        ? `Buying-group gap: missing ${missingLabels.join(", ")}. Deal can stall even if the call felt positive.`
        : `Buying-group alignment missing: ${missingLabels.join(", ")}. Do not treat this as contract-ready.`;

  const confidence = clamp(
    55 +
      present_roles.length * 12 -
      missing_roles.length * 14 +
      (evidence.length ? 8 : 0) +
      (stakeholders.length ? 5 : -10)
  );

  return {
    status,
    summary,
    expected_roles: expected,
    present_roles: [...new Set(present_roles)],
    missing_roles: [...new Set(missing_roles)],
    quiet_stakeholders,
    roles,
    confidence,
    evidence,
  };
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
