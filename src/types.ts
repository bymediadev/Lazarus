export interface PostMortemResult {
  stall_cause: string;
  why_it_stalled: string;
  restart_plan: string[];
  client_name?: string;
}

export const MOCK_POST_MORTEM: PostMortemResult = {
  client_name: "Meridian Health — RevOps",
  stall_cause:
    "Deal killed by unaligned multi-department security gate — CISO questionnaire unanswered, IT blocked on US-East data residency, and Procurement flagged the $52K price as over the $40K three-quote threshold.",
  why_it_stalled:
    "Champion Priya lost internal air cover during a hiring freeze while Security, Legal, and Procurement were never in the same room. The rep sent async docs but never secured a joint 45-minute review. Momentum died when leadership defaulted to 'just use Salesforce Einstein' as the path of least resistance, and four follow-up emails over 10 days went unanswered.",
  restart_plan: [
    "Send a 3-line exec note from your VP Sales to their CFO framing forecast-accuracy ROI vs. native Einstein — attach a healthcare RevOps reference willing to take a 15-min call.",
    "Book a 45-min live security workshop with CISO + IT: cover US-East storage, subprocessor list, and DPA redlines — do not send another PDF.",
    "Restructure to Phase 1 under $38K (20 seats, SFDC + HubSpot sync only) to bypass three-quote procurement until Q4 expansion.",
    "Multi-thread: ask Priya for a warm intro to Procurement lead by name; offer to pre-fill their vendor comparison grid.",
    "Set a hard 72-hour re-engagement deadline — if no security meeting booked, mark lost and recycle in 90 days.",
  ],
};
