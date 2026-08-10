/** WhiteWhale account intelligence attached to a Lazarus deal analysis. */

export interface WhiteWhaleSignalSource {
  source?: string | null;
  headline?: string | null;
  quotes?: string[];
  one_sentence_summary?: string | null;
}

export interface WhiteWhaleSignal {
  name: string;
  question: string;
  answer: string;
  long_answer?: string | null;
  probability?: number | null;
  date?: string | null;
  sources: WhiteWhaleSignalSource[];
}

export interface WhiteWhaleAccountIntel {
  domain: string;
  account_id?: string;
  name?: string | null;
  status?: string | null;
  scaled_score?: number | null;
  /** Why Now / account narrative from WhiteWhale */
  summary?: string | null;
  industry?: string | null;
  employees?: number | null;
  linkedin_url?: string | null;
  signal_names: string[];
  signals: WhiteWhaleSignal[];
  source: "whitewhale";
}
