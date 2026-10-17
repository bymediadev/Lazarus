import type {
  AcvBand,
  ForecastOwnership,
  QualifierAnswers,
  QualifierIntent,
  QualifierPain,
  QualifierResult,
  QualifierRole,
  QualifierTier,
  SellingMotion,
} from "./types";

const STALL_PAINS: QualifierPain[] = ["forecast-slip", "manual-inspection", "happy-ears"];

export const ROLE_LABEL: Record<QualifierRole, string> = {
  "sales-manager": "Sales Manager",
  "vp-sales": "VP of Sales",
  cro: "CRO",
  "head-of-bd": "Head of BD",
  ae: "AE / SDR",
  revops: "RevOps or advisor",
  other: "Other",
};

export const OWNERSHIP_LABEL: Record<ForecastOwnership, string> = {
  "owns-call": "Owns the forecast call",
  inspects: "Inspects deals on the call",
  "no-number": "Does not own a forecast number",
};

export const MOTION_LABEL: Record<SellingMotion, string> = {
  saas: "Mid-market B2B SaaS",
  msp: "MSP or IT services",
  "complex-b2b": "Complex B2B with recorded calls",
  transactional: "Short-cycle or self-serve",
  "enterprise-soc2": "Enterprise, SOC 2 required before a pilot",
};

export const ACV_LABEL: Record<AcvBand, string> = {
  "under-15k": "Under $15K",
  "mid-saas": "$25K–$150K",
  services: "$50K–$250K services",
  above: "Above the usual band",
  unsure: "Deal size not confirmed",
};

export const PAIN_LABEL: Record<QualifierPain, string> = {
  "forecast-slip": "Forecast is slipping and they cannot explain it",
  "manual-inspection": "Manual deal inspection before the forecast call",
  "happy-ears": "Happy ears — reps say warm, nothing is moving",
  "healthy-pipeline": "Pipeline is healthy",
  "wants-outreach": "Wants software that sends outreach or closes",
};

export const INTENT_LABEL: Record<QualifierIntent, string> = {
  "forecast-clarity": "Forecast clarity, blockers, and the next action",
  "replace-recorder": "Replace the recorder",
  autonomous: "Autonomous outreach or closing",
  "rep-notes": "Personal notes for a rep",
};

const SUBJECT = {
  primary: "Which deals on your forecast are actually closable?",
  secondary: "Recoverable vs flat no before your next forecast call",
  partner: "Your pipeline review is missing the \"why\"",
  bad: "This forecast triage is a mismatch",
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function stallPains(pains: QualifierPain[]): QualifierPain[] {
  return pains.filter((pain) => STALL_PAINS.includes(pain));
}

function rawScore(answers: QualifierAnswers, stallCount: number): number {
  let score = 1;
  if (answers.role === "sales-manager" || answers.role === "vp-sales") score += 2;
  else if (answers.role === "cro" || answers.role === "head-of-bd") score += 1;
  else if (answers.role === "ae") score -= 2;
  else if (answers.role === "revops") score -= 1;

  if (answers.ownership === "owns-call") score += 2;
  else if (answers.ownership === "inspects") score += 1;
  else score -= 2;

  if (answers.motion === "saas" || answers.motion === "msp" || answers.motion === "complex-b2b") {
    score += 1;
  } else if (answers.motion === "transactional") score -= 3;
  else score -= 2;

  if (answers.acv === "mid-saas" || answers.acv === "services") score += 1;
  else if (answers.acv === "under-15k") score -= 2;

  score += Math.min(stallCount, 3);
  if (answers.pains.includes("healthy-pipeline")) score -= 2;
  if (answers.pains.includes("wants-outreach")) score -= 3;

  if (answers.intent === "forecast-clarity") score += 1;
  else if (answers.intent === "autonomous") score -= 3;
  else score -= 2;

  return clamp(score, 1, 10);
}

function buyerMatch(answers: QualifierAnswers, owns: boolean): string {
  return `${ROLE_LABEL[answers.role]} — owns forecast/deal inspection? ${owns ? "yes" : "no"}`;
}

type Copy = Pick<QualifierResult, "headline" | "detail" | "next" | "angle" | "disqualifiers" | "subject">;

function badFitCopy(answers: QualifierAnswers, owns: boolean, stallCount: number): Copy {
  const disqualifiers: string[] = [];
  if (answers.intent === "autonomous" || answers.pains.includes("wants-outreach")) {
    disqualifiers.push("Wants outreach or an autonomous closer.");
  }
  if (answers.intent === "replace-recorder") {
    disqualifiers.push("Wants a conversation-intelligence replacement.");
  }
  if (answers.role === "ae" || answers.intent === "rep-notes") {
    disqualifiers.push("Individual rep, or a personal note-taker.");
  }
  if (answers.motion === "transactional" || answers.acv === "under-15k") {
    disqualifiers.push("Short-cycle, self-serve, or under $15K ACV.");
  }
  if (answers.motion === "enterprise-soc2") {
    disqualifiers.push("Needs SOC 2 before a pilot.");
  }
  if (answers.pains.includes("healthy-pipeline") && stallCount === 0) {
    disqualifiers.push("No stall pattern.");
  }
  if (!owns && answers.role !== "revops") {
    disqualifiers.push("Does not own a forecast number.");
  }
  if (answers.role === "revops") {
    disqualifiers.push("Advisor or RevOps — not the manager who owns the number.");
  }
  const complex =
    answers.motion === "saas" || answers.motion === "msp" || answers.motion === "complex-b2b";
  if (answers.intent !== "forecast-clarity" && !disqualifiers.some((line) => /autonomous|recorder|note-taker/i.test(line))) {
    disqualifiers.push("Asked for something other than forecast clarity.");
  }
  if (!complex && answers.motion !== "transactional" && answers.motion !== "enterprise-soc2") {
    disqualifiers.push("Selling motion is outside the usual fit.");
  }
  if (stallCount === 0 && !answers.pains.includes("healthy-pipeline") && !answers.pains.includes("wants-outreach")) {
    disqualifiers.push("No forecast-slip, inspection, or happy-ears signal.");
  }

  if (answers.intent === "autonomous" || answers.pains.includes("wants-outreach")) {
    return {
      headline: "You need outbound automation.",
      detail:
        "Lazarus Deal Recovery does not send outreach or close deals. The team stays in control. The product judges stalled deals for the person who owns the forecast.",
      next: "Look for an outbound tool. If a sales manager on your team owns a slipping forecast, they are the buyer.",
      angle: "Disqualify. Suggest outbound automation.",
      disqualifiers,
      subject: SUBJECT.bad,
    };
  }
  if (answers.intent === "replace-recorder") {
    return {
      headline: "Keep the recorder.",
      detail:
        "Lazarus Deal Recovery is the judgment layer on top of the meeting stack: which deals close, which are recoverable, which are a flat no.",
      next: "Stay with the recorder unless a manager wants forecast triage before the next call.",
      angle: "Disqualify a conversation-intelligence replacement.",
      disqualifiers,
      subject: SUBJECT.bad,
    };
  }
  if (answers.role === "ae" || answers.intent === "rep-notes") {
    return {
      headline: "Managers buy this.",
      detail:
        "Reps may use the product. The buyer owns the forecast call and needs a defendable story: closable, recoverable, or a flat no.",
      next: "Bring the sales manager or VP who runs the forecast. Rep-only notes are the wrong wedge.",
      angle: "Disqualify a rep shopping for themselves.",
      disqualifiers,
      subject: SUBJECT.bad,
    };
  }
  if (answers.motion === "transactional" || answers.acv === "under-15k") {
    return {
      headline: "The value is thin here.",
      detail:
        "Lazarus Deal Recovery is for longer B2B cycles with recorded calls, stalled commits, and a manager who has to defend the number.",
      next: "Skip a pilot unless the motion is mid-market SaaS, MSP, or similar complex B2B.",
      angle: "Disqualify transactional or sub-$15K pipeline.",
      disqualifiers,
      subject: SUBJECT.bad,
    };
  }
  if (answers.motion === "enterprise-soc2") {
    return {
      headline: "Suitable for a pilot on SMB B2B today.",
      detail:
        "Lazarus Deal Recovery is not SOC 2 certified. Enterprise teams that require SOC 2 before a pilot should wait.",
      next: "Pass for now. A mid-market team that can pilot without SOC 2 is the fit.",
      angle: "Be honest about the security roadmap.",
      disqualifiers,
      subject: SUBJECT.bad,
    };
  }
  if (answers.pains.includes("healthy-pipeline") && stallCount === 0) {
    return {
      headline: "Little to recover if nothing is stalling.",
      detail:
        "The product earns its place when deals slip, reps stay optimistic, or the manager is rebuilding the story from call recordings.",
      next: "Come back when a forecast call has deals you cannot defend.",
      angle: "Disqualify a healthy pipeline.",
      disqualifiers,
      subject: SUBJECT.bad,
    };
  }
  if (!owns) {
    return {
      headline: "The buyer owns the forecast number.",
      detail:
        "Lazarus Deal Recovery is for the sales manager or VP who has to walk in knowing which rep-owned deals will close.",
      next: "Introduce the person who runs the forecast call.",
      angle: "Wrong seat. Ask for the forecast owner.",
      disqualifiers,
      subject: SUBJECT.bad,
    };
  }
  return {
    headline: "The pain or the motion does not match.",
    detail:
      "A fit is a manager on a complex B2B forecast who needs closable versus blocked, and a next action they can paste into the CRM.",
    next: "Leave a note if a manager on the team has that forecast call. Otherwise this is a pass.",
    angle: "Hold. Confirm forecast pain and a complex cycle.",
    disqualifiers: disqualifiers.length ? disqualifiers : ["Fit checklist did not clear."],
    subject: SUBJECT.bad,
  };
}

function finish(
  answers: QualifierAnswers,
  tier: QualifierTier,
  copy: Copy,
  stall: QualifierPain[],
  owns: boolean
): QualifierResult {
  let score = rawScore(answers, stall.length);
  if (tier === "bad-fit") score = Math.min(score, 3);
  if (tier === "partner-later") score = stall.length >= 2 ? 5 : 4;
  if (tier === "secondary") score = clamp(score, 6, 8);
  if (tier === "primary") score = clamp(score, 7, 10);
  return {
    tier,
    score,
    buyerMatch: buyerMatch(answers, owns),
    ownsForecast: owns,
    signals: stall.map((pain) => PAIN_LABEL[pain]),
    ...copy,
  };
}

/** Deterministic ICP fit. Safe to run in the browser with no API call. */
export function qualify(answers: QualifierAnswers): QualifierResult {
  const owns = answers.ownership === "owns-call" || answers.ownership === "inspects";
  const stall = stallPains(answers.pains);
  const complex =
    answers.motion === "saas" || answers.motion === "msp" || answers.motion === "complex-b2b";
  const manager = answers.role === "sales-manager" || answers.role === "vp-sales";
  const secondaryRole =
    answers.role === "cro" || answers.role === "head-of-bd" || answers.role === "other";
  const hardStop =
    answers.intent === "autonomous" ||
    answers.pains.includes("wants-outreach") ||
    answers.intent === "replace-recorder" ||
    answers.role === "ae" ||
    answers.intent === "rep-notes" ||
    answers.motion === "transactional" ||
    answers.acv === "under-15k" ||
    answers.motion === "enterprise-soc2" ||
    (answers.pains.includes("healthy-pipeline") && stall.length === 0);

  if (hardStop) {
    return finish(answers, "bad-fit", badFitCopy(answers, owns, stall.length), stall, owns);
  }

  if (answers.role === "revops" && answers.intent === "forecast-clarity") {
    return finish(
      answers,
      "partner-later",
      {
        headline: "Better as an introduction than a pilot.",
        detail:
          "Advisors and RevOps are useful once a manager wedge is proven. The first tester is the sales manager or VP who owns the forecast call.",
        next: "Introduce an active sales manager. Take the network access. Do not put the advisor in the tester seat.",
        angle: "Partner later. Ask for the manager who owns the number.",
        disqualifiers: ["Advisor or RevOps — not the manager who owns the number."],
        subject: SUBJECT.partner,
      },
      stall,
      owns
    );
  }

  if (manager && owns && complex && answers.intent === "forecast-clarity" && stall.length > 0) {
    const above = answers.acv === "above" ? " Deal size is above the usual band." : "";
    const unsure = answers.acv === "unsure" ? " Deal size was not confirmed." : "";
    return finish(
      answers,
      "primary",
      {
        headline: "This is a fit. You own the forecast call.",
        detail: `Walk the sample board, then leave a note. A person reads it in the morning.${above}${unsure}`,
        next: "Sample forecast call, then a note for sales.",
        angle: "Forecast call. Recoverable versus a flat no, then a CRM-ready plan.",
        disqualifiers: [],
        subject: SUBJECT.primary,
      },
      stall,
      owns
    );
  }

  if (secondaryRole && owns && complex && answers.intent === "forecast-clarity" && stall.length > 0) {
    return finish(
      answers,
      "secondary",
      {
        headline: "Worth a look. You still sit in deal inspection.",
        detail:
          answers.role === "other"
            ? "The title is unclear. If you run the forecast call, this is the right conversation."
            : "Same triage as a frontline manager: which deals close, which are recoverable, which come off the forecast.",
        next: "Walk the sample forecast, then leave a note with the team size.",
        angle: "Forecast triage for someone who still inspects deals.",
        disqualifiers: [],
        subject: SUBJECT.secondary,
      },
      stall,
      owns
    );
  }

  return finish(answers, "bad-fit", badFitCopy(answers, owns, stall.length), stall, owns);
}

export function tierLabel(tier: QualifierTier): string {
  if (tier === "primary") return "Primary fit";
  if (tier === "secondary") return "Secondary fit";
  if (tier === "partner-later") return "Partner later";
  return "Not a fit";
}
