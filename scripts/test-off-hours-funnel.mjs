import { arrivalOpensNow, qualifySharePath, readArrival, SHARE_LINKS } from "../src/qualifier/arrival.ts";
import { inviteCopy, matchKeyword, parseKeywords } from "../src/qualifier/invite.ts";
import { companyDomain, preCallBrief } from "../src/qualifier/brief.ts";
import { answerGate, classifyAmount, EMPTY_GATES, HOLD_COPY, morningAllowed, parseDealAmount, routeContext, routeIntegrity } from "../src/qualifier/gates.ts";
import { isPrivateAddress, profileFromHtml } from "../server/companyProfile.ts";
import { answerFaq } from "../src/qualifier/faq.ts";
import { redactTranscript } from "../src/qualifier/redact.ts";
import { bookingSlotFromMessage, forecastInstant, forecastWindow, formatSlot, isOpenSlot, morningSlots, slotsBeforeForecast, zonedTimeToUtc } from "../src/qualifier/slots.ts";
import { readTeaser, scoreVerdict } from "../src/qualifier/teaser.ts";

let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}`);
}

const sample = [
  "Priya Shah: We can sign if legal has the packet by Thursday.",
  "The champion at Harbor Security Inc confirmed a budget of $84,000.",
  "Email jane.doe@northwind.com about the $62K review.",
  "I'm Marcus Hale, and the champion left 47 days ago.",
].join("\n");

const redacted = redactTranscript(sample);
check("speaker name is redacted", redacted.text.includes("[REDACTED_NAME]") && !redacted.text.includes("Priya Shah"));
check("company with Inc is redacted", !redacted.text.includes("Harbor Security Inc") && redacted.text.includes("[REDACTED_COMPANY]"));
check("dollar amount is redacted", !redacted.text.includes("$84,000") && !redacted.text.includes("$62K"));
check("email is redacted", !redacted.text.includes("jane.doe@northwind.com"));
check("day count stays", redacted.text.includes("47 days"));
check("Thursday stays", /Thursday/.test(redacted.text));

const price = answerFaq("Can you discount this to $40?");
check("discount question stays on the published price", price.answer.includes("$99") && price.answer.includes("$10"));
check("discount question does not invent $40", !price.answer.includes("$40"));
check("unknown question does not negotiate", /does not negotiate/i.test(answerFaq("What is your favorite color?").answer));
check("unknown question does not offer a morning", /does not book a morning/i.test(answerFaq("What is your favorite color?").answer));
check("transcript format stays in the browser", /browser/i.test(answerFaq("What format do transcripts need to be in?").answer));
check("autonomous ask is refused", /does not send outreach/i.test(answerFaq("Can the AI close deals for us?").answer));

const mondayMorning = zonedTimeToUtc(2026, 10, 19, 8);
check("Monday 8:00 AM Eastern is open", isOpenSlot(mondayMorning) && mondayMorning.toISOString() === "2026-10-19T12:00:00.000Z");
check("Monday 3:00 PM Eastern is closed", !isOpenSlot(zonedTimeToUtc(2026, 10, 19, 15)));
check("Saturday morning is closed", !isOpenSlot(zonedTimeToUtc(2026, 10, 17, 8)));
check("Sunday morning is closed", !isOpenSlot(zonedTimeToUtc(2026, 10, 18, 9)));
check("Monday 2:00 PM Eastern is open", isOpenSlot(zonedTimeToUtc(2026, 10, 19, 14)));
check("Monday 8:15 AM Eastern is open", isOpenSlot(zonedTimeToUtc(2026, 10, 19, 8, "America/New_York", 15)));
check("Monday 8:10 AM Eastern is closed", !isOpenSlot(zonedTimeToUtc(2026, 10, 19, 8, "America/New_York", 10)));
const nyTen = forecastInstant("2026-10-22T10:00", "America/New_York");
const chicagoTen = forecastInstant("2026-10-22T10:00", "America/Chicago");
check("the same clock in Chicago is later in UTC than New York", Boolean(nyTen && chicagoTen) && chicagoTen.getTime() > nyTen.getTime());
check(
  "a Chicago wall clock formats in Chicago",
  /Chicago/.test(formatSlot(chicagoTen, "America/Chicago")) && !/New York/.test(formatSlot(chicagoTen, "America/Chicago"))
);
check("a booking slot still labels New York", /New York/.test(formatSlot(zonedTimeToUtc(2026, 10, 19, 8))));

const fromSaturday = new Date("2026-10-17T15:00:00.000Z");
const slots = morningSlots(fromSaturday, 6);
check("next slots skip the weekend", slots.length === 6 && slots.every((slot) => isOpenSlot(new Date(slot.iso))));
check("first slot after Saturday is Monday morning", slots[0]?.iso === mondayMorning.toISOString());
check("no Saturday or Sunday label", slots.every((slot) => !/^Sat|^Sun/.test(slot.label)));

const teaser = readTeaser({
  proprietary_indices: {
    deal_risk_index: 72,
    stakeholder_dispersion_index: 10,
    dialogue_stall_score: 4,
    authority_gap_flag: false,
    multi_department_friction: 2,
    risk_tier: "HIGH",
    formula: "",
    dialogue_stall: {},
    stakeholder_dispersion: { index: 10, authority_gap: false, multi_department_friction: 2, persona_breakdown: {}, flags: [] },
  },
  recoverability: { status: "RECOVERABLE", confidence: 0.6, blocking_conditions: ["Procurement wants a security review."], evidence_gaps: [] },
  stakeholders: [{ name: "A", role: "Procurement", stance: "detractor", evidence: "I still need security to look at this." }],
  immediate_remediation: ["Get the champion to book the security review."],
});
check("teaser keeps the risk score", teaser.risk === 72 && teaser.verdict === "Recoverable");
check("teaser keeps the detractor quote", /security to look/i.test(teaser.quote));
check("this-week plan is separate from the quote", teaser.thisWeek[0]?.includes("security review"));

const booked = bookingSlotFromMessage({
  originator: "CAL",
  type: "bookingSuccessful",
  data: { startTime: mondayMorning.toISOString() },
});
check("weekday morning embed booking is accepted", booked && "iso" in booked);
const sunday = bookingSlotFromMessage({
  type: "bookingSuccessful",
  data: { startTime: zonedTimeToUtc(2026, 10, 18, 9).toISOString() },
});
check("Sunday embed booking is refused", sunday && "refused" in sunday);

check("linkedin query opens now", readArrival("?from=linkedin", "") === "linkedin" && arrivalOpensNow("linkedin"));
check("linkedin referrer opens now", readArrival("", "https://www.linkedin.com/feed/") === "linkedin");
check("email medium opens now", readArrival("?utm_medium=email", "") === "email" && arrivalOpensNow("email"));
check("a normal visit stays on the site timer", readArrival("", "https://www.google.com/") === "site" && !arrivalOpensNow("site"));
check("linkedin share link is the live qualify page", SHARE_LINKS.linkedin === "https://www.getldr.ca/qualify?from=linkedin");
check("email share link is the live qualify page", SHARE_LINKS.email === "https://www.getldr.ca/qualify?from=email");
check("home linkedin sends people to /qualify", qualifySharePath("?from=linkedin", "") === "/qualify?from=linkedin");
check("home email sends people to /qualify", qualifySharePath("?utm_medium=email", "") === "/qualify?utm_medium=email&from=email");
check("a normal home visit stays on the home page", qualifySharePath("", "") == null);
check("qualify is a keyword", matchKeyword("Can we qualify this week?") === "qualify");
check("yes alone is a keyword", matchKeyword("Yes") === "yes");
check("hello is not a keyword", matchKeyword("Hello there") == null);
check("custom keywords come from the list", matchKeyword("send the triage", parseKeywords("triage,hello")) === "triage");
const linkedinInvite = inviteCopy({ channel: "linkedin", name: "Priya" });
check("linkedin invite carries the share link", linkedinInvite.link === SHARE_LINKS.linkedin && linkedinInvite.text.includes(SHARE_LINKS.linkedin));
check("linkedin invite stays short", linkedinInvite.text.length < 600 && linkedinInvite.text.includes("Priya"));
const companyAt = linkedinInvite.text.indexOf("https://www.linkedin.com/company/lazarus-deal-recovery");
const personalAt = linkedinInvite.text.indexOf("https://www.linkedin.com/in/jjebennett/");
check(
  "invite shows the company page, then Joshua's profile",
  linkedinInvite.text.includes("joshua@getldr.ca") && companyAt > 0 && personalAt > companyAt
);
const emailInvite = inviteCopy({ channel: "email" });
check("email invite uses the email share link", emailInvite.link === SHARE_LINKS.email);
check(
  "email invite keeps the company page and leaves out Joshua's profile",
  emailInvite.text.includes("https://www.linkedin.com/company/lazarus-deal-recovery") &&
    !emailInvite.text.includes("https://www.linkedin.com/in/jjebennett/")
);

const noOwner = answerGate("ownership", "no", EMPTY_GATES);
check("no forecast owner gets the report and no morning", noOwner.access === "report" && noOwner.reason === "ownership");
check("outreach is a hard stop", answerGate("intent", "outreach", EMPTY_GATES).access === "stop" && HOLD_COPY.outreach.allowScore === false);
const small = answerGate("acv", "under-25k", { ...EMPTY_GATES, ownership: "yes" });
check("under $25k stays on the diagnostic", small.access === "report" && small.reason === "small-acv");
const oneOff = answerGate("pattern", "one-off", { ...EMPTY_GATES, ownership: "yes", acv: "over-25k" });
check("one isolated call stays on the diagnostic", oneOff.access === "report" && oneOff.reason === "one-off");
check("80000 and 80k are the same amount", parseDealAmount("$80,000") === 80000 && parseDealAmount("80k") === 80000);
const priced = classifyAmount("80000", EMPTY_GATES);
check("80000 continues to ownership", priced.access === "pending" && priced.step === "ownership" && priced.amount === 80000);
const tiny = classifyAmount("4000", EMPTY_GATES);
check("4000 stays on the diagnostic", tiny.access === "report" && tiny.reason === "small-acv");
const keeps = answerGate("drop", "no", { ...EMPTY_GATES, ownership: "yes", acv: "over-25k" });
check("keeping a flat no locks the morning", keeps.access === "report" && keeps.reason === "keep-dead");
check("a flat no never opens a morning", morningAllowed("Flat no", "calendar", true) === false);
check("a checkpoint never opens a morning", morningAllowed("Checkpoint", "calendar", true) === false);
check("a recoverable brief stays shut until they commit", morningAllowed("Recoverable", "calendar", false) === false);
check("a committed recoverable deal can open a morning", morningAllowed("Recoverable", "calendar", true) === true);

const tuesdayNine = zonedTimeToUtc(2026, 10, 20, 9);
const beforeWindow = slotsBeforeForecast(tuesdayNine, zonedTimeToUtc(2026, 10, 16, 8), 20);
check("48 hours before Tuesday keeps Monday", beforeWindow.some((slot) => slot.label.startsWith("Mon")));
check("48 hours before Tuesday drops Friday", !beforeWindow.some((slot) => slot.label.startsWith("Fri")));
check("a Monday 8am forecast has no earlier open morning", slotsBeforeForecast(zonedTimeToUtc(2026, 10, 19, 8), zonedTimeToUtc(2026, 10, 16, 8), 20).length === 0);

let state = answerGate("ownership", "yes", EMPTY_GATES);
check("forecast owner continues", state.access === "pending" && state.step === "drop");
state = answerGate("drop", "yes", state.answers);
check("pulling a flat no continues", state.access === "pending" && state.step === "pattern");
state = answerGate("pattern", "systematic", state.answers);
check("a pipeline pattern continues", state.access === "pending" && state.step === "intent");
const diagnostic = answerGate("intent", "diagnostic", state.answers);
check("diagnostic intent locks the morning", diagnostic.access === "report" && diagnostic.reason === "diagnostic");
state = answerGate("intent", "recovery", state.answers);
check("recovery workflow continues", state.access === "pending" && state.step === "present");
const absent = answerGate("present", "no", state.answers);
check("missing forecast owner locks the morning", absent.access === "report" && absent.reason === "absent");
const qualified = answerGate("present", "yes", state.answers);
check("full fit opens the morning after the transcript", qualified.access === "calendar");

const saturday = new Date("2026-10-17T15:00:00.000Z");
const thursdayCall = zonedTimeToUtc(2026, 10, 22, 10);
check("a Thursday forecast from Saturday has a window", forecastWindow(thursdayCall, saturday) === "open");
check(
  "a forecast inside 3 hours has no morning",
  forecastWindow(new Date("2026-10-20T15:00:00.000Z"), new Date("2026-10-20T12:30:00.000Z")) === "too-soon"
);
check(
  "a Monday 8am forecast has no window",
  forecastWindow(zonedTimeToUtc(2026, 10, 19, 8), zonedTimeToUtc(2026, 10, 16, 8)) === "none"
);
const openClock = routeContext({ account: "Harbor", amount: "80k", forecastAt: thursdayCall, from: saturday });
check("a $80k deal with a window asks the two questions", openClock.next === "integrity" && openClock.missing == null);
const smallClock = routeContext({ account: "Harbor", amount: "4000", forecastAt: thursdayCall, from: saturday });
check("under $25k scores with the calendar shut", smallClock.next === "score" && smallClock.reason === "small-acv");
const soonClock = routeContext({
  account: "Harbor",
  amount: "80k",
  forecastAt: new Date("2026-10-20T15:00:00.000Z"),
  from: new Date("2026-10-20T13:00:00.000Z"),
});
check("a forecast inside 3 hours scores with the calendar shut", soonClock.next === "score" && soonClock.reason === "too-soon");
const bothYes = routeIntegrity("yes", "yes");
check("both yeses reach the transcript", bothYes.access === "calendar" && bothYes.missing == null);
const repNow = routeIntegrity("no", "yes");
check("a rep scores with the calendar shut", repNow.access === "report" && repNow.reason === "ownership");
const keepsDead = routeIntegrity("yes", "no");
check("keeping a dead deal scores with the calendar shut", keepsDead.access === "report" && keepsDead.reason === "keep-dead");
check("recoverable is the open verdict", scoreVerdict({ recoverability: { status: "RECOVERABLE" } }) === "Recoverable");
check(
  "conditional recoverable stays open",
  scoreVerdict({ recoverability: { status: "CONDITIONALLY_RECOVERABLE" } }) === "Recoverable"
);
check("motion not established is a checkpoint", scoreVerdict({ deal_status: "MOTION NOT ESTABLISHED" }) === "Checkpoint");
check("a flat no verdict stays shut", scoreVerdict({ recoverability: { status: "FLAT_NO" } }) === "Flat no");
check(
  "not currently recoverable is a flat no",
  scoreVerdict({ recoverability: { status: "NOT_CURRENTLY_RECOVERABLE" } }) === "Flat no"
);

check("a bare domain is the company url", companyDomain("https://www.HarborLogistics.com/about") === "harborlogistics.com");
check("localhost is not a company url", companyDomain("http://localhost:3001") == null);
check("an address is not a company url", companyDomain("http://127.0.0.1") == null);
check("loopback is private", isPrivateAddress("127.0.0.1") && isPrivateAddress("::1") && isPrivateAddress("169.254.169.254"));
check("a public address is not private", isPrivateAddress("93.184.216.34") === false);
const page = `<html><head><title>Ignored</title><meta name="description" content="Freight software for mid-market shippers."></head></html>`;
check("the profile is the description the site published", profileFromHtml(page) === "Freight software for mid-market shippers.");
check("a page with no description says so", profileFromHtml("<html><title></title></html>") === "The site did not publish a description.");
const card = preCallBrief({
  domain: "harborlogistics.com",
  profile: "Freight software for mid-market shippers.",
  account: "Acme Corp",
  acv: "80000",
  owner: "Priya Shah",
  forecastLabel: "Thu, Oct 22, 10:00 AM ET",
  slotLabel: "Tue, Oct 20, 8:00 AM ET",
  verdict: "Recoverable",
  blocker: "Legal never received the packet.",
});
check("the briefing names the site and the account", card.includes("harborlogistics.com") && card.includes("Acme Corp (80000)"));
check("the briefing uses the score's break", card.includes("Legal never received the packet."));
check("the briefing does not invent a minute marker", !card.includes("minute 22") && !card.includes("Ghosting"));

if (failed) {
  console.error(`${failed} off-hours check(s) failed`);
  process.exit(1);
}
console.log("off-hours funnel checks passed");
