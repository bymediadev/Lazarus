import type { DemoDeal } from "./types";

/** Sample forecast board. Static copy only — never sent to the analysis engine. */
export const DEMO_DEALS: DemoDeal[] = [
  {
    id: "northwind",
    name: "Northwind Analytics",
    owner: "Priya",
    amount: "$84K",
    stage: "Commit",
    verdict: "closable",
    verdictLabel: "Closable",
    blocker: "Legal returned the redlines. The champion confirmed the Q4 budget on Tuesday.",
    quote: "“We can sign this month if the packet is in legal by Thursday.”",
    thisWeek: "Send the signature packet.",
    inside30: null,
    inside90: null,
    crm: [
      "Forecast: closable.",
      "Northwind Analytics · $84K · close date holds.",
      "Blocker cleared: legal returned redlines. Champion confirmed the Q4 budget on Tuesday.",
      "Next: send the signature packet this week.",
    ].join("\n"),
  },
  {
    id: "harbor",
    name: "Harbor Security",
    owner: "Marcus",
    amount: "$62K",
    stage: "Negotiation",
    verdict: "recoverable",
    verdictLabel: "Recoverable",
    blocker: "Procurement wants a security review. The champion has not scheduled it.",
    quote: "“I still need security to look at this before I can take it upstairs.”",
    thisWeek: "Get the champion to book the security review.",
    inside30: "Send the one-pager they can forward internally.",
    inside90: null,
    crm: [
      "Forecast: recoverable. Not a flat no.",
      "Harbor Security · $62K.",
      "Blocker: Procurement wants a security review. The champion has not scheduled it.",
      "This week (0–7 days): get the champion to book the security review.",
      "Inside 30 days: send the one-pager they can forward internally.",
    ].join("\n"),
  },
  {
    id: "keel",
    name: "Keel Logistics",
    owner: "Elena",
    amount: "$110K",
    stage: "Evaluation",
    verdict: "flat-no",
    verdictLabel: "Flat no",
    blocker: "The champion left. There is no economic buyer. Last activity was 47 days ago.",
    quote: "“She was the one pushing this. I don’t know who owns it now.”",
    thisWeek: "Stop. Take it off the forecast.",
    inside30: null,
    inside90: null,
    crm: [
      "Forecast: flat no. Pull it.",
      "Keel Logistics · $110K.",
      "Champion left. No economic buyer. Last activity 47 days ago.",
      "Next: stop. Do not spend another quarter on it.",
    ].join("\n"),
  },
];

export const FORECAST_CALL_LINE =
  "One closes. One is recoverable if the security review gets booked. One comes off the forecast.";
