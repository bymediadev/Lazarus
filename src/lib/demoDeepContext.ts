/** Mirrors fixtures/sample_deep_context.json for UI demo load. */

export const demoDeepContext = {

  account_id: "acme-corp-2026",

  sales_cycle_days: 186,

  historical_crm_context: [

    {

      date: "2026-01-14",

      stage: "Discovery",

      past_identified_veto_holders: [

        { veto_holder_id: "dave-vp-infrastructure", display_name: "Dave — VP Infrastructure" },

      ],

      past_logged_objections: [

        "Needs Security and Legal in the same room before any pilot",

        "Internal tooling budget capped at $40K",

      ],

    },

    {

      date: "2026-03-22",

      stage: "Technical Eval",

      past_identified_veto_holders: [

        { veto_holder_id: "sarah-chen-risk-compliance", display_name: "Sarah Chen — Risk & Compliance" },

      ],

      past_logged_objections: [

        "DPA language stalled prior vendor for two months",

        "Cannot sign until federal audit window closes in Q3",

      ],

    },

    {

      date: "2026-05-08",

      stage: "Procurement",

      past_identified_veto_holders: [

        { veto_holder_id: "sarah-chen-risk-compliance", display_name: "Sarah Chen — Risk & Compliance" },

        { veto_holder_id: "procurement-unnamed", display_name: "Procurement — unnamed" },

      ],

      past_logged_objections: [

        "Send SOC 2 and proposal async — no live meeting until Legal reviews",

        "Enterprise pricing exceeds approved departmental budget",

      ],

    },

  ],

} as const;

