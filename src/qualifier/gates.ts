import { forecastWindow } from "./slots";

export type GateStep = "account" | "ownership" | "drop" | "acv" | "pattern" | "intent" | "present";

export type Volume = "low" | "steady" | "team";

export type GateAnswers = {
  ownership: "yes" | "no" | null;
  acv: "under-25k" | "over-25k" | null;
  drop: "yes" | "no" | null;
  pattern: "one-off" | "systematic" | null;
  intent: "diagnostic" | "recovery" | "outreach" | null;
  present: "yes" | "no" | null;
  volume: Volume | null;
};

export const EMPTY_GATES: GateAnswers = {
  ownership: null,
  acv: null,
  drop: null,
  pattern: null,
  intent: null,
  present: null,
  volume: null,
};

export type HoldReason = "ownership" | "small-acv" | "keep-dead" | "one-off" | "diagnostic" | "absent" | "outreach";

export type GateAccess = "pending" | "report" | "stop" | "calendar";

export type GateResult = {
  answers: GateAnswers;
  step: GateStep;
  access: GateAccess;
  reason: HoldReason | null;
};

export type GateChoice = {
  id: string;
  label: string;
};

export const GATE_PROMPTS: Record<GateStep, { title: string; prompt: string; choices: GateChoice[] }> = {
  account: {
    title: "The account",
    prompt: "Which account, and how much is at risk?",
    choices: [],
  },
  drop: {
    title: "A flat no",
    prompt: "If this comes back a flat no, will you take it off the forecast this week?",
    choices: [
      { id: "yes", label: "Yes. I'll take it off." },
      { id: "no", label: "No. I'll keep it on the forecast." },
    ],
  },
  ownership: {
    title: "Forecast ownership",
    prompt: "Do you carry the pipeline forecast number for this team?",
    choices: [
      { id: "yes", label: "Yes. I defend that number." },
      { id: "no", label: "No. I don't carry the number." },
    ],
  },
  acv: {
    title: "Deal size",
    prompt: "What is the usual deal size, and the size of this stalled account?",
    choices: [
      { id: "under-25k", label: "Under $25k" },
      { id: "over-25k", label: "$25k or more" },
    ],
  },
  pattern: {
    title: "Pipeline pattern",
    prompt: "Is this stall a pattern across accounts this quarter, or one call?",
    choices: [
      { id: "systematic", label: "A pattern across accounts" },
      { id: "one-off", label: "One isolated call" },
    ],
  },
  intent: {
    title: "What you want",
    prompt: "What should this do?",
    choices: [
      { id: "diagnostic", label: "Score this call and show where it broke." },
      { id: "recovery", label: "Recoverable or flat no, and the next action the team runs." },
      { id: "outreach", label: "Send outreach or close the deal." },
    ],
  },
  present: {
    title: "Who is on the morning",
    prompt: "Will the person who carries the quarterly number be on the call?",
    choices: [
      { id: "yes", label: "Yes. They will be on the call." },
      { id: "no", label: "No. Someone else would take it." },
    ],
  },
};

export const VOLUME_PROMPT: { prompt: string; choices: GateChoice[] } = {
  prompt: "How many stalled calls need a read this month?",
  choices: [
    { id: "low", label: "One or two" },
    { id: "steady", label: "A handful, up to twenty" },
    { id: "team", label: "More than one manager, every week" },
  ],
};

export const HOLD_COPY: Record<HoldReason, { title: string; body: string; allowScore: boolean }> = {
  ownership: {
    title: "Score the call. Send the morning to your VP.",
    body: "A strategy morning is for the person who defends the forecast. You can score a stalled call now. Five a month are free, then $10 a report. Send this to your VP of Sales or founder if they own the number.",
    allowScore: true,
  },
  "small-acv": {
    title: "Score the call. Skip the morning.",
    body: "A morning is the wrong spend under $25k. Score the stalled call. Five a month are free, then $10 a report. Entry is $99 a month for 20. Team is $499 a month for unlimited. When the deals and the forecast owner are both here, the morning is open.",
    allowScore: true,
  },
  "keep-dead": {
    title: "Score the call. The morning will not move it.",
    body: "If you will not take a flat no off the forecast, an hour on the calendar changes nothing. Score the call. Five a month are free. You get the risk and the blocker.",
    allowScore: true,
  },
  "one-off": {
    title: "Score this call. A morning is for a pattern.",
    body: "One stalled call does not need a strategy session. Score it. Five a month are free. A morning is for the same stall across the pipeline, with the forecast owner on the call.",
    allowScore: true,
  },
  diagnostic: {
    title: "Score the call.",
    body: "You asked for the diagnosis, not a working session. Score it. Five a month are free. You get the risk and the blocker. The morning is for a team that will run the next action.",
    allowScore: true,
  },
  absent: {
    title: "Score the call. They book the morning.",
    body: "You can see the score today. The morning only helps if the person who carries the number is on it. Send them this when you have the result.",
    allowScore: true,
  },
  outreach: {
    title: "This is the wrong system",
    body: "Lazarus does not send outreach or close deals. It tells the forecast owner which deals are recoverable and what to do next.",
    allowScore: false,
  },
};

function pending(answers: GateAnswers, step: GateStep): GateResult {
  return { answers, step, access: "pending", reason: null };
}

function held(answers: GateAnswers, step: GateStep, reason: HoldReason, access: "report" | "stop"): GateResult {
  return { answers, step, access, reason };
}

/** One plain-text answer. The transcript and the calendar stay closed until this returns calendar. */
export function answerGate(step: GateStep, choice: string, prev: GateAnswers): GateResult {
  const answers = { ...prev };
  if (step === "ownership") {
    if (choice !== "yes" && choice !== "no") return pending(answers, step);
    answers.ownership = choice;
    if (choice === "no") return held(answers, step, "ownership", "report");
    return pending(answers, "drop");
  }
  if (step === "drop") {
    if (choice !== "yes" && choice !== "no") return pending(answers, step);
    answers.drop = choice;
    if (choice === "no") return held(answers, step, "keep-dead", "report");
    return pending(answers, "pattern");
  }
  if (step === "acv") {
    if (choice !== "under-25k" && choice !== "over-25k") return pending(answers, step);
    answers.acv = choice;
    if (choice === "under-25k") return held(answers, step, "small-acv", "report");
    return pending(answers, "pattern");
  }
  if (step === "pattern") {
    if (choice !== "systematic" && choice !== "one-off") return pending(answers, step);
    answers.pattern = choice;
    if (choice === "one-off") return held(answers, step, "one-off", "report");
    return pending(answers, "intent");
  }
  if (step === "intent") {
    if (choice !== "diagnostic" && choice !== "recovery" && choice !== "outreach") return pending(answers, step);
    answers.intent = choice;
    if (choice === "outreach") return held(answers, step, "outreach", "stop");
    if (choice === "diagnostic") return held(answers, step, "diagnostic", "report");
    return pending(answers, "present");
  }
  if (choice !== "yes" && choice !== "no") return pending(answers, step);
  answers.present = choice;
  if (choice === "no") return held(answers, step, "absent", "report");
  return { answers, step, access: "calendar", reason: null };
}

export function parseDealAmount(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  const scaled = text.match(/^(\d+(?:\.\d+)?)(k|m)$/);
  if (scaled) {
    const n = Number(scaled[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * (scaled[2] === "m" ? 1_000_000 : 1_000));
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** The amount stays in the intake. It is not a scoring input. */
export function classifyAmount(raw: string, prev: GateAnswers): GateResult & { amount: number | null } {
  const amount = parseDealAmount(raw);
  if (amount == null) return { ...pending(prev, "account"), amount: null };
  const answers = { ...prev, acv: amount >= 25_000 ? ("over-25k" as const) : ("under-25k" as const) };
  if (amount < 25_000) return { ...held(answers, "account", "small-acv", "report"), amount };
  return { ...pending(answers, "ownership"), amount };
}

export const FLAT_NO_DIRECTIVE =
  "Take this deal off the list today. Do not send a follow-up. Have the salesperson work a live deal.";

export const CHECKPOINT_DIRECTIVE =
  "We cannot tell who is in this deal, or the deal has not really started. A meeting with us stays closed.";

/** The calendar opens only after a recoverable brief and a yes on the action. */
export function morningAllowed(verdict: string, access: GateAccess, committed = false): boolean {
  return access === "calendar" && verdict === "Recoverable" && committed;
}

export type ClockReason = "small-acv" | "too-soon" | "no-window" | "ownership" | "keep-dead";

export type RouteNotice = {
  access: "report" | "calendar";
  reason: ClockReason | null;
  title: string;
  body: string;
  allowScore: boolean;
};

const BRIEF_ONLY = "You get the report. A meeting with us stays closed.";

export function routeContext(input: {
  account: string;
  amount: string;
  forecastAt: Date | null;
  from?: Date;
}): RouteNotice & { amount: number | null; missing: string | null; next: "integrity" | "score" } {
  const blank = {
    access: "report" as const,
    reason: null,
    title: "",
    body: "",
    allowScore: true,
    amount: null as number | null,
    missing: null as string | null,
    next: "score" as const,
  };
  if (input.account.trim().length < 2) return { ...blank, missing: "Name the account." };
  const amount = parseDealAmount(input.amount);
  if (amount == null) return { ...blank, missing: "Enter the amount at risk, like 80000 or 80k." };
  if (!input.forecastAt || Number.isNaN(input.forecastAt.getTime())) {
    return { ...blank, amount, missing: "Tell us when your team meets. Use New York time." };
  }
  if (amount < 25_000) {
    return {
      ...blank,
      amount,
      reason: "small-acv",
      title: "Report only.",
      body: `This deal is under $25,000. A meeting with us is too big for it. ${BRIEF_ONLY} Five reports a month are free. One extra report is $10.`,
    };
  }
  const window = forecastWindow(input.forecastAt, input.from ?? new Date());
  if (window === "too-soon") {
    return {
      ...blank,
      amount,
      reason: "too-soon",
      title: "Report only.",
      body: `Your team meets in less than 3 hours. There is no time to meet us first. ${BRIEF_ONLY}`,
    };
  }
  if (window === "none") {
    return {
      ...blank,
      amount,
      reason: "no-window",
      title: "Report only.",
      body: `There is no open time with us in the two days before your team meets. ${BRIEF_ONLY}`,
    };
  }
  return { ...blank, amount, access: "calendar", next: "integrity", title: "", body: "" };
}

export function routeIntegrity(ownership: string, drop: string): RouteNotice & { missing: string | null } {
  if (ownership !== "yes" && ownership !== "no") {
    return {
      access: "report",
      reason: null,
      title: "",
      body: "",
      allowScore: true,
      missing: "Say if you own the sales number.",
    };
  }
  if (drop !== "yes" && drop !== "no") {
    return {
      access: "report",
      reason: null,
      title: "",
      body: "",
      allowScore: true,
      missing: "Say if you will take a dead deal off the list.",
    };
  }
  if (ownership === "no") {
    return {
      access: "report",
      reason: "ownership",
      title: "Report only.",
      body: `You do not own the sales number. Send the report to the person who does. ${BRIEF_ONLY}`,
      allowScore: true,
      missing: null,
    };
  }
  if (drop === "no") {
    return {
      access: "report",
      reason: "keep-dead",
      title: "Report only.",
      body: `If you will leave a dead deal on the list, a meeting will not help. ${BRIEF_ONLY}`,
      allowScore: true,
      missing: null,
    };
  }
  return {
    access: "calendar",
    reason: null,
    title: "Score the call.",
    body: "A short meeting with us opens only if the deal can still be saved, and only if you will do the next step before your team meets.",
    allowScore: true,
    missing: null,
  };
}

export type PlanFit = "free" | "entry" | "team" | "none";

export type BuyerDirection = GateResult & {
  title: string;
  body: string;
  allowScore: boolean;
  plan: PlanFit;
};

const FREE_LINE = "Five a month are free. One extra report is $10.";
const ENTRY_LINE = "Entry is $99 a month for 20. Five a month are free while you confirm the pattern.";
const TEAM_LINE = "Team is $499 a month, unlimited, when more than one manager needs the same read.";

function planLine(volume: Volume | null): { plan: Exclude<PlanFit, "none">; line: string } {
  if (volume === "team") return { plan: "team", line: TEAM_LINE };
  if (volume === "steady") return { plan: "entry", line: ENTRY_LINE };
  return { plan: "free", line: FREE_LINE };
}

/**
 * The next step comes from the whole circumstance.
 * Volume picks the plan. Fit picks whether a morning exists. A mismatch picks neither.
 */
export function directBuyer(answers: GateAnswers, amount: number): BuyerDirection {
  const base = { answers, step: "present" as GateStep };
  const priced = planLine(answers.volume);

  if (answers.intent === "outreach") {
    return {
      ...base,
      access: "stop",
      reason: "outreach",
      title: "This is the wrong system",
      body: "Lazarus does not send outreach or close deals. It tells the forecast owner which deals are recoverable and what to do next.",
      allowScore: false,
      plan: "none",
    };
  }
  if (answers.ownership === "no") {
    return {
      ...base,
      access: "report",
      reason: "ownership",
      title: "Score one call. Send it up.",
      body: "You do not carry the number. Five a month are free, which is enough to show the person who does. The morning and a monthly plan stay with them.",
      allowScore: true,
      plan: "free",
    };
  }
  if (answers.drop === "no") {
    return {
      ...base,
      access: "report",
      reason: "keep-dead",
      title: "Score it once. Then stop.",
      body: "If you will not take a flat no off the forecast, Entry, Team, and a morning all waste the hour. Five a month are free if you want the risk and the blocker in writing.",
      allowScore: true,
      plan: "none",
    };
  }
  if (amount < 25_000) {
    const body =
      answers.volume === "team"
        ? "Team is for managers defending deals at $25k and up. At this size, five a month are free. The morning stays shut."
        : answers.volume === "steady"
          ? "Under $25k, the morning stays shut. Five a month are free. If you pass five, Entry is $99 for 20. Team is the wrong plan at this size."
          : "Under $25k, the morning is the wrong spend. Five a month are free. One extra report is $10.";
    return {
      ...base,
      access: "report",
      reason: "small-acv",
      title: "Five free. Skip the morning.",
      body,
      allowScore: true,
      plan: "free",
    };
  }
  if (answers.pattern === "one-off") {
    return {
      ...base,
      access: "report",
      reason: "one-off",
      title: "One call. Five free.",
      body: "A morning is for the same stall across the pipeline. Five a month are free. One extra report is $10. Do not start Entry for a single call.",
      allowScore: true,
      plan: "free",
    };
  }
  if (answers.intent === "diagnostic") {
    return {
      ...base,
      access: "report",
      reason: "diagnostic",
      title: "Score the call.",
      body: `You asked for the diagnosis, not a working session. ${priced.line} The morning opens when the team will run the next action.`,
      allowScore: true,
      plan: priced.plan,
    };
  }
  if (answers.present === "no") {
    return {
      ...base,
      access: "report",
      reason: "absent",
      title: "Score it. They book the morning.",
      body: `The morning only helps if the person who carries the number is on it. ${priced.line}`,
      allowScore: true,
      plan: priced.plan,
    };
  }
  const title =
    priced.plan === "team"
      ? "Score it, then book the morning. Team is the plan."
      : priced.plan === "entry"
        ? "Score it, then book the morning. Entry is the plan."
        : "Score it, then book the morning.";
  return {
    ...base,
    access: "calendar",
    reason: null,
    title,
    body: `${priced.line} The morning is only for the 48 hours before the forecast call, and only if the score is not a flat no.`,
    allowScore: true,
    plan: priced.plan,
  };
}

export type IntakeChoices = {
  account: string;
  amount: string;
  ownership: string;
  drop: string;
  pattern: string;
  intent: string;
  present: string;
  volume: string;
};

/** One pass. Volume picks the plan. The rest of the answers pick the morning. */
const BLANK_DIRECTION: BuyerDirection = {
  answers: EMPTY_GATES,
  step: "account",
  access: "pending",
  reason: null,
  title: "",
  body: "",
  allowScore: false,
  plan: "none",
};

export function qualifyIntake(input: IntakeChoices): BuyerDirection & { amount: number | null; missing: string | null } {
  if (input.account.trim().length < 2) {
    return { ...BLANK_DIRECTION, amount: null, missing: "Name the account." };
  }
  const amount = parseDealAmount(input.amount);
  if (amount == null) {
    return { ...BLANK_DIRECTION, amount: null, missing: "Enter the amount at risk, like 80000 or 80k." };
  }
  if (input.ownership !== "yes" && input.ownership !== "no") {
    return { ...BLANK_DIRECTION, amount, missing: "Say whether you carry the forecast number." };
  }
  if (input.drop !== "yes" && input.drop !== "no") {
    return { ...BLANK_DIRECTION, amount, missing: "Say whether you will take a flat no off the forecast." };
  }
  if (input.pattern !== "systematic" && input.pattern !== "one-off") {
    return { ...BLANK_DIRECTION, amount, missing: "Say whether this stall is a pattern." };
  }
  if (input.intent !== "diagnostic" && input.intent !== "recovery" && input.intent !== "outreach") {
    return { ...BLANK_DIRECTION, amount, missing: "Say what you want this to do." };
  }
  if (input.present !== "yes" && input.present !== "no") {
    return { ...BLANK_DIRECTION, amount, missing: "Say whether the forecast owner will be on the call." };
  }
  if (input.volume !== "low" && input.volume !== "steady" && input.volume !== "team") {
    return { ...BLANK_DIRECTION, amount, missing: "Say how many stalled calls need a read this month." };
  }
  const answers: GateAnswers = {
    ownership: input.ownership,
    acv: amount >= 25_000 ? "over-25k" : "under-25k",
    drop: input.drop,
    pattern: input.pattern,
    intent: input.intent,
    present: input.present,
    volume: input.volume,
  };
  return { ...directBuyer(answers, amount), amount, missing: null };
}

export function gateSummary(answers: GateAnswers, account = "", amount = ""): string {
  return [
    `Account: ${account.trim() || "—"}`,
    `Amount at risk: ${amount.trim() || "—"}`,
    `Owns forecast: ${answers.ownership ?? "—"}`,
    `Will pull a flat no: ${answers.drop ?? "—"}`,
    `Deal size: ${answers.acv ?? "—"}`,
    `Pattern: ${answers.pattern ?? "—"}`,
    `Intent: ${answers.intent ?? "—"}`,
    `Forecast owner on the call: ${answers.present ?? "—"}`,
    `Volume this month: ${answers.volume ?? "—"}`,
  ].join("\n");
}
