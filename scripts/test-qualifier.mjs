import { DEMO_DEALS, FORECAST_CALL_LINE } from "../src/qualifier/deals.ts";
import { handoffMessage } from "../src/qualifier/handoff.ts";
import { qualify } from "../src/qualifier/score.ts";

let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}`);
}

const manager = {
  role: "sales-manager",
  ownership: "owns-call",
  motion: "saas",
  acv: "mid-saas",
  pains: ["forecast-slip", "happy-ears"],
  intent: "forecast-clarity",
};

const primary = qualify(manager);
check("manager who owns the call is a primary fit", primary.tier === "primary");
check("primary score stays in range", primary.score >= 7 && primary.score <= 10);
check("primary has no disqualifiers", primary.disqualifiers.length === 0);
check(
  "primary subject is the forecast question",
  primary.subject === "Which deals on your forecast are actually closable?"
);
check("primary names both stall signals", primary.signals.length === 2);

const vpInspects = qualify({
  ...manager,
  role: "vp-sales",
  ownership: "inspects",
  acv: "unsure",
  pains: ["manual-inspection"],
});
check("VP who inspects deals stays primary", vpInspects.tier === "primary");
check("one pain and an unconfirmed ACV scores under a full primary", vpInspects.score < primary.score);

const cro = qualify({
  ...manager,
  role: "cro",
  ownership: "inspects",
  motion: "msp",
  acv: "services",
  pains: ["manual-inspection"],
});
check("CRO who still inspects is secondary", cro.tier === "secondary");
check("secondary score stays in band", cro.score >= 6 && cro.score <= 8);

const advisor = qualify({
  ...manager,
  role: "revops",
  ownership: "no-number",
});
check("RevOps without the number is partner-later", advisor.tier === "partner-later");
check("partner score stays at 4 or 5", advisor.score === 4 || advisor.score === 5);
check("partner copy asks for the manager", /manager/i.test(advisor.next));

const rep = qualify({
  ...manager,
  role: "ae",
  ownership: "no-number",
  intent: "rep-notes",
});
check("a rep shopping for notes is a bad fit", rep.tier === "bad-fit");
check("rep score stays low", rep.score <= 3);
check(
  "rep copy sends them to the manager",
  /manager/i.test(`${rep.headline} ${rep.detail} ${rep.next}`)
);

const closer = qualify({
  ...manager,
  role: "vp-sales",
  pains: ["wants-outreach", "forecast-slip"],
  intent: "autonomous",
});
check("autonomous closer is a bad fit even with forecast pain", closer.tier === "bad-fit");
check("autonomous copy points at outbound", /outbound/i.test(closer.headline + closer.detail));

const recorder = qualify({ ...manager, intent: "replace-recorder" });
check("recorder replacement is a bad fit", recorder.tier === "bad-fit");
check("recorder copy keeps the meeting stack", /recorder/i.test(recorder.headline));

const transactional = qualify({ ...manager, motion: "transactional", acv: "under-15k" });
check("short-cycle pipeline is a bad fit", transactional.tier === "bad-fit");

const soc2 = qualify({ ...manager, motion: "enterprise-soc2" });
check("SOC 2 before a pilot is a bad fit", soc2.tier === "bad-fit");
check("SOC 2 copy is honest", /SOC 2/i.test(soc2.detail));

const healthy = qualify({ ...manager, pains: ["healthy-pipeline"] });
check("a healthy pipeline is a bad fit", healthy.tier === "bad-fit");

const noSeat = qualify({ ...manager, ownership: "no-number" });
check("a manager title without the number is a bad fit", noSeat.tier === "bad-fit");

check("sample board has three verdicts", DEMO_DEALS.map((deal) => deal.verdict).join(",") === "closable,recoverable,flat-no");
check("flat no tells the manager to stop", /stop/i.test(DEMO_DEALS[2].thisWeek));
check("forecast line names the three outcomes", /closes/i.test(FORECAST_CALL_LINE) && /flat no|off the forecast/i.test(FORECAST_CALL_LINE));

const note = handoffMessage({
  answers: manager,
  result: primary,
  name: "Avery Chen",
  company: "Northwind",
  openedDeals: ["Harbor Security"],
});
check("handoff names the company and the opened deal", /Northwind/.test(note) && /Harbor Security/.test(note));
check("handoff stays off the analysis engine", /analysis engine/i.test(note));
check("handoff fits the contact limit", note.length < 4000);

if (failed) {
  console.error(`${failed} qualifier check(s) failed`);
  process.exit(1);
}
console.log("qualifier checks passed");
