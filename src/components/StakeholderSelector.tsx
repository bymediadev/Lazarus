import { useId, useState, type KeyboardEvent } from "react";
import TrustPackLink from "./TrustPackLink";

type RoleId = "legal" | "security" | "revenue";

type Role = {
  id: RoleId;
  mark: string;
  label: string;
  detail?: string;
  header: string;
  bullets: string[];
};

const ROLES: Role[] = [
  {
    id: "security",
    mark: "🛡️",
    label: "Security & IT Leaders",
    header: "Not SOC 2 today. The data path is still narrow.",
    bullets: [
      "The call, the email, and the quotes are used to write the report, then not saved. Audio is processed in memory and is not written to disk. A guest run is not saved to an account.",
      "The report stays while the deal is still open. When HubSpot or Salesforce marks the deal complete, the report is deleted then. If the CRM is not connected, it is deleted 30 days after a win or a flat no.",
      "Each company only sees its own reports. A company key is shown once. We store a hash, not the key. Their server sends the deal in. The transcript stays on their side.",
      "Your content is not used to train public models. HubSpot and Salesforce stay read-only until someone pushes the plan.",
    ],
  },
  {
    id: "legal",
    mark: "⚖️",
    label: "Legal & Compliance",
    header: "What we keep, and when it goes.",
    bullets: [
      "You own the recording, the transcript, and the notes you upload. We process them only to write the report. We do not sell that content or train public models on it.",
      "The transcript and the quotes are not saved. We keep the score, the status, and the next actions.",
      "That report stays while the deal is open. When HubSpot or Salesforce marks the deal complete, it is deleted then. If the CRM is not connected, it is deleted 30 days after a win or a flat no.",
      "A signed-in user can delete the account from Account. Or email support@getldr.ca. We do not sell personal information.",
      "We are not SOC 2 certified, and we do not claim a finished GDPR or CCPA program. Read the Privacy Policy, the DPA, and the Security Overview before a larger contract.",
    ],
  },
  {
    id: "revenue",
    mark: "🚀",
    label: "Revenue Leadership",
    detail: "CRO / Sales Ops",
    header: "Which stalled deals still belong on the forecast.",
    bullets: [
      "Recoverable or a flat no, what is blocking it, and the next conversation.",
      "Start with one transcript. Five free analyses. No credit card. Connecting HubSpot or Salesforce is optional.",
    ],
  },
];

function BulletMark() {
  return (
    <svg className="stakeholder-bullet" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.2 10.2 8.7 12.6 13.8 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StakeholderSelector() {
  const [activeId, setActiveId] = useState<RoleId>("security");
  const selectId = useId();
  const panelId = useId();
  const active = ROLES.find((role) => role.id === activeId) ?? ROLES[0];

  const selectRole = (id: RoleId) => {
    setActiveId(id);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = ROLES.findIndex((role) => role.id === activeId);
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? ROLES[(current + 1) % ROLES.length]
        : ROLES[(current - 1 + ROLES.length) % ROLES.length];
    setActiveId(next.id);
    const tab = event.currentTarget.querySelector<HTMLButtonElement>(`#stakeholder-tab-${next.id}`);
    tab?.focus();
  };

  return (
    <section className="stakeholder-selector" aria-labelledby="stakeholder-selector-title">
      <p className="stakeholder-eyebrow">Enterprise review</p>
      <h2 id="stakeholder-selector-title">What each stakeholder needs</h2>

      <label className="stakeholder-select-label" htmlFor={selectId}>
        Choose a stakeholder
      </label>
      <select
        id={selectId}
        className="stakeholder-select"
        value={activeId}
        onChange={(event) => selectRole(event.target.value as RoleId)}
      >
        {ROLES.map((role) => (
          <option key={role.id} value={role.id}>
            {role.mark} {role.label}
            {role.detail ? ` (${role.detail})` : ""}
          </option>
        ))}
      </select>

      <div
        className="stakeholder-tabs"
        role="tablist"
        aria-label="Enterprise stakeholders"
        onKeyDown={onTabKeyDown}
      >
        {ROLES.map((role) => {
          const selected = role.id === activeId;
          return (
            <button
              key={role.id}
              id={`stakeholder-tab-${role.id}`}
              type="button"
              role="tab"
              className={`stakeholder-tab${selected ? " is-active" : ""}`}
              aria-selected={selected}
              aria-controls={panelId}
              aria-label={role.detail ? `${role.label} (${role.detail})` : role.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectRole(role.id)}
            >
              <span className="stakeholder-tab-mark" aria-hidden="true">
                {role.mark}
              </span>
              <span className="stakeholder-tab-text">
                <span>{role.label}</span>
                {role.detail && <span className="stakeholder-tab-detail">{role.detail}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <article
        key={active.id}
        id={panelId}
        className="stakeholder-panel"
        role="tabpanel"
        aria-labelledby={`stakeholder-tab-${active.id}`}
      >
        <h3>{active.header}</h3>
        <ul className="stakeholder-points">
          {active.bullets.map((bullet) => (
            <li key={bullet}>
              <BulletMark />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        {active.id === "security" && (
          <p className="stakeholder-note">
            Full detail in the <TrustPackLink slug="security-overview">Security Overview</TrustPackLink>.
          </p>
        )}
      </article>
    </section>
  );
}
