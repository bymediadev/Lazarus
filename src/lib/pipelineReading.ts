export interface PipelineReading {
  currentStatus: string;
  qualification: string;
  recommendedStage: string;
  recommendedAction: string;
  note: string;
}

/** Current status, staging history, and the next recommendation are different claims. */
export function pipelineReading(input: {
  currentStatus?: string;
  qualification?: string;
  stageChange?: string;
  optimalDecision?: string;
}): PipelineReading {
  return {
    currentStatus: input.currentStatus?.trim() || "Not scored",
    qualification: input.qualification?.trim() || "",
    recommendedStage: input.stageChange?.trim() || "",
    recommendedAction: input.optimalDecision?.trim() || "",
    note: "Current status is the scored deal state. Qualification is about how the opportunity was staged. The stage change and the optimal decision are recommendations, not a second status.",
  };
}
