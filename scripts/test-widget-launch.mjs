import { createLaunchTicket, consumeLaunchTicket } from "../server/widgetLaunch.ts";

function check(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  console.log(`OK: ${name}`);
}

const id = createLaunchTicket({
  userId: "user-1",
  email: "ae@example.com",
  tokenHash: "hash-1",
  emailOtp: null,
  widget: "teams",
});

const first = consumeLaunchTicket(id);
check("consume returns ticket once", first?.email === "ae@example.com" && first.widget === "teams");
check("second consume fails", consumeLaunchTicket(id) === null);
check("empty consume fails", consumeLaunchTicket("") === null);
check("unknown consume fails", consumeLaunchTicket("nope") === null);

console.log("WIDGET LAUNCH TICKET OK");
