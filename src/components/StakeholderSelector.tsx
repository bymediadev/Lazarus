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
      "Guest scans are ephemeral. Raw audio is processed in memory and is not saved to disk. Model APIs use zero-retention settings where the provider allows it, and your content is not used to train public models.",
      "Saved transcript text purges on a 30-day default. Teams only see their own deals. HubSpot and Salesforce stay read-only until you push the plan.",
    ],
  },
  {
    id: "legal",
    mark: "⚖️",
    label: "Legal & Compliance",
    header: "Automated Data Governance & Privacy Peace of Mind",
    bullets: [
      "Bilateral Data Minimization: Lazarus only indexes context related to stagnant metadata. We explicitly omit and scrub personal identifiable financial or health data (PII).",
      "Right-to-Forget Architecture: Fully compliant with GDPR and CCPA protocols. Delete a tenant workspace and all synced records are immediately purged permanently within 24 hours.",
    ],
  },
  {
    id: "revenue",
    mark: "🚀",
    label: "Revenue Leadership",
    detail: "CRO / Sales Ops",
    header: "Maximum Pipeline Accuracy & Immediate Time-to-Value",
    bullets: [
      "A plan sized to the deal: the next action, the next checkpoint, and a longer path only when procurement, legal, or security still has to move. A flat no says stop.",
      "Frictionless Onboarding: Zero engineering hours required from your internal IT team to initiate a 5-deal proof-of-concept.",
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
