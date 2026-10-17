const FIXED_PRICE =
  "You pay per deal analysis, not per seat. Five a month are free, then $10 a report. Entry is $99 a month for 20. Team is $499 a month for unlimited. This widget does not change those prices.";

const ANSWERS: { test: RegExp; answer: string }[] = [
  {
    test: /discount|negotiat|cheaper|%\s*off|cut the price|best price|can you do/i,
    answer: FIXED_PRICE,
  },
  {
    test: /transcript|zoom|fathom|gong|otter|what format|recording|audio|paste/i,
    answer:
      "Paste a .txt, .md, or .csv transcript. Names, companies, and amounts are replaced in this browser before anything is sent. A recording stays on Test a Stalled Deal.",
  },
  {
    test: /niche|industry|right for (me|us)|saas|msp|forecast owner|which tier|fit\b/i,
    answer:
      "It fits a sales manager or VP who defends a forecast on complex B2B deals, usually $25k and up, with a recorded call. " +
      FIXED_PRICE +
      " A weekday morning is only for that forecast owner.",
  },
  {
    test: /outreach|autonomous|ai sdr|close deals for|replace (our |the )?reps|send emails for/i,
    answer:
      "Lazarus Deal Recovery does not send outreach or close deals. A person still runs the deal. The report says which deals are recoverable, which are a flat no, and the next action.",
  },
  { test: /price|pricing|cost|\$|plan|per seat|free|how much/i, answer: FIXED_PRICE },
  {
    test: /soc|secur|hipaa|sso|privacy|train|save the call|transcript stored|gdpr/i,
    answer:
      "Not SOC 2 certified today. That is an honest fit for a pilot and for mid-market. The transcript is sent for scoring and is not saved. Your content is not used to train public models. No SSO and no HIPAA agreement on this hosted app.",
  },
  {
    test: /hubspot|salesforce|crm|integrat/i,
    answer:
      "You can run a deal without connecting HubSpot or Salesforce. A later push writes a note only when someone clicks it. It does not change the pipeline stage on its own.",
  },
];

/** Published pages only. No price other than the live list. */
export function answerFaq(question: string): { matched: boolean; answer: string } {
  const text = question.trim();
  if (!text) {
    return {
      matched: false,
      answer: "Ask about pricing, security, or HubSpot and Salesforce.",
    };
  }
  const hit = ANSWERS.find((item) => item.test.test(text));
  if (!hit) {
    return {
      matched: false,
      answer:
        "This assistant answers pricing, security, CRM, and transcript format from the published pages. It does not negotiate price, and it does not book a morning.",
    };
  }
  return { matched: true, answer: hit.answer };
}
