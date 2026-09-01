export type VendorDashboardLink = {
  id: string;
  label: string;
  href: string;
  why: string;
  extra?: Array<{ label: string; href: string }>;
};

/** Public dashboard URLs only — never include API keys. */
export function supabaseDashboardBase(): string | null {
  const raw = (process.env.SUPABASE_URL ?? "").trim();
  const hosted = raw.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (hosted) return `https://supabase.com/dashboard/project/${hosted[1]}`;
  return null;
}

export function vendorDashboards(): VendorDashboardLink[] {
  const supabase = supabaseDashboardBase();
  const supabaseAuth = supabase
    ? `${supabase}/auth/providers`
    : "https://supabase.com/dashboard";
  const supabaseExtra = supabase
    ? [
        { label: "Email templates", href: `${supabase}/auth/templates` },
        { label: "Project", href: supabase },
      ]
    : undefined;
  return [
    {
      id: "gemini",
      label: "Google AI Studio",
      href: "https://aistudio.google.com/usage",
      why: "Usage graph and monthly spend cap. Stay on Flash; ~$10/month is enough for launch.",
      extra: [{ label: "API keys", href: "https://aistudio.google.com/apikey" }],
    },
    {
      id: "assemblyai",
      label: "AssemblyAI",
      href: "https://www.assemblyai.com/app",
      why: "Audio minutes and spending limit. Paste-transcript still works if this is off.",
    },
    {
      id: "supabase",
      label: "Supabase Auth",
      href: supabaseAuth,
      why: "Email + password, leaked-password protection, and SMTP.",
      extra: supabaseExtra,
    },
  ];
}
