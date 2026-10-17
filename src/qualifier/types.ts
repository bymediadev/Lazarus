/** Off-hours fit check. This module does not call the deal engine. */

export type QualifierRole =
  | "sales-manager"
  | "vp-sales"
  | "cro"
  | "head-of-bd"
  | "ae"
  | "revops"
  | "other";

export type ForecastOwnership = "owns-call" | "inspects" | "no-number";

export type SellingMotion =
  | "saas"
  | "msp"
  | "complex-b2b"
  | "transactional"
  | "enterprise-soc2";

export type AcvBand = "under-15k" | "mid-saas" | "services" | "above" | "unsure";

export type QualifierPain =
  | "forecast-slip"
  | "manual-inspection"
  | "happy-ears"
  | "healthy-pipeline"
  | "wants-outreach";

export type QualifierIntent =
  | "forecast-clarity"
  | "replace-recorder"
  | "autonomous"
  | "rep-notes";

export type QualifierTier = "primary" | "secondary" | "partner-later" | "bad-fit";

export type QualifierAnswers = {
  role: QualifierRole;
  ownership: ForecastOwnership;
  motion: SellingMotion;
  acv: AcvBand;
  pains: QualifierPain[];
  intent: QualifierIntent;
};

export type QualifierResult = {
  tier: QualifierTier;
  score: number;
  buyerMatch: string;
  ownsForecast: boolean;
  signals: string[];
  disqualifiers: string[];
  angle: string;
  subject: string;
  headline: string;
  detail: string;
  next: string;
};

export type DemoVerdict = "closable" | "recoverable" | "flat-no";

export type DemoDeal = {
  id: string;
  name: string;
  owner: string;
  amount: string;
  stage: string;
  verdict: DemoVerdict;
  verdictLabel: string;
  blocker: string;
  quote: string;
  thisWeek: string;
  inside30: string | null;
  inside90: string | null;
  crm: string;
};
