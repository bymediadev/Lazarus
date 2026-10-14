import { readFileSync } from "fs";
import { assessIntentExtraction, buildIntentRetryInstructions } from "../src/lib/intentExtraction.ts";

const transcript = readFileSync("fixtures/sarah_mark_transcript.txt", "utf8");
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}`);
}

const captured = [
  { type: "Constraint", weight: 90, evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday." },
  { type: "Structural", weight: 85, evidence: "nothing's approved on the infrastructure side yet." },
  { type: "Constraint", weight: 70, evidence: "Without him, I'm not moving this forward." },
  { type: "Enabler", weight: 80, evidence: "Budget-wise, $280K is what we modeled." },
  { type: "Timing", weight: 75, evidence: "Yes, but he's underwater until month-end." },
];

const omitted = assessIntentExtraction(transcript, captured);
check("omitted willingness is missing, not unknown", omitted.status === "missing_despite_signals");
check("likes the overview is a missing signal", omitted.missing.some((signal) => /i like what i saw/i.test(signal.quote)));
check("conditional acceleration is a missing signal", omitted.missing.some((signal) => /we can accelerate/i.test(signal.quote)));

const withIntent = assessIntentExtraction(transcript, [
  ...captured,
  { type: "Structural", weight: 95, evidence: "Dave hasn't validated the architecture." },
  { type: "Intent", weight: 40, evidence: "I like what I saw in the overview." },
]);
check("quoted interest counts while the blocker stays severe", withIntent.status === "represented");

const zeroIntent = assessIntentExtraction(transcript, [
  ...captured,
  { type: "Intent", weight: 0, evidence: "Without him, I'm not moving this forward." },
]);
check("intent weight 0 does not count as represented", zeroIntent.status === "missing_despite_signals");

const ambiguous = assessIntentExtraction(
  "We might look at this next quarter. Nobody has reviewed the proposal.",
  [{ type: "Constraint", weight: 60, evidence: "Nobody has reviewed the proposal." }]
);
check("absent willingness stays unknown", ambiguous.status === "unknown");

const refusal = assessIntentExtraction(
  "We are not interested in moving forward with this.",
  [{ type: "Constraint", weight: 80, evidence: "We are not interested in moving forward with this." }]
);
check("an explicit refusal is not treated as unknown", refusal.status === "explicit_refusal");

const northstarWillingness = assessIntentExtraction(
  [
    "**Sarah:** I don't think we should close the door.",
    "**Sarah:** The project hasn't disappeared.",
    "**Sarah:** We're still looking at ways to improve the workflows.",
  ].join("\n"),
  [{ type: "Enabler", weight: 60, evidence: "We're still looking at ways to improve the workflows." }]
);
check(
  "continued pursuit is willingness even when it is not filed as Intent",
  northstarWillingness.status === "missing_despite_signals" &&
    northstarWillingness.missing.some((signal) => /close the door/i.test(signal.quote))
);

const instructions = buildIntentRetryInstructions(omitted.missing);
check("retry names the source sentences", /i like what i saw/i.test(instructions) && /we can accelerate/i.test(instructions));
check("retry does not prescribe an intent weight", !/\b(weight|intent)\s*(to|=|:)\s*\d+/i.test(instructions) && !/\b(50|75|80|90)\b/.test(instructions));

if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("intent extraction contract passed");
