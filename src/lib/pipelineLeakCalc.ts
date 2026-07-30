export interface PipelineLeakInputs {
  dealSize: number;
  commissionPct: number;
  /** Outreach attempts per rep in the modeled period */
  totalCalls: number;
  salesStaffCount: number;
  pickupPct: number;
  meetingPct: number;
  closePct: number;
  /** Fraction of leaked pipeline Lazarus Deal Recovery recovers (default 10%) */
  rescueRate?: number;
}

export interface PipelineLeakResults {
  salesStaffCount: number;
  totalConversations: number;
  totalMeetings: number;
  dealsClosed: number;
  totalRevenue: number;
  totalCommission: number;
  lostConversations: number;
  lostMeetings: number;
  totalLeakedDeals: number;
  savedFromConversations: number;
  savedFromMeetings: number;
  actualDealsSaved: number;
  revenueSaved: number;
  commissionSaved: number;
  valuePerCall: number;
  teamOutreach: number;
  teamLeakedDeals: number;
  teamRevenueSaved: number;
  teamCommissionSaved: number;
  teamTotalCommission: number;
}

export const DEFAULT_PIPELINE_INPUTS: PipelineLeakInputs = {
  dealSize: 50_000,
  commissionPct: 10,
  totalCalls: 4_000,
  salesStaffCount: 5,
  pickupPct: 3,
  meetingPct: 20,
  closePct: 30,
  rescueRate: 10,
};

function pct(n: number): number {
  return Math.max(0, n) / 100;
}

export function computePipelineLeak(inputs: PipelineLeakInputs): PipelineLeakResults {
  const dealSize = Math.max(0, inputs.dealSize);
  const commissionRate = pct(inputs.commissionPct);
  const totalCalls = Math.max(0, inputs.totalCalls);
  const pickupRate = pct(inputs.pickupPct);
  const meetingRate = pct(inputs.meetingPct);
  const closeRate = pct(inputs.closePct);
  const salvageRate = pct(inputs.rescueRate ?? 10);
  const salesStaffCount = Math.max(1, Math.round(inputs.salesStaffCount || 1));

  const totalConversations = totalCalls * pickupRate;
  const totalMeetings = totalConversations * meetingRate;
  const dealsClosed = totalMeetings * closeRate;
  const totalRevenue = dealsClosed * dealSize;
  const totalCommission = totalRevenue * commissionRate;

  const lostConversations = totalConversations - totalMeetings;
  const lostMeetings = totalMeetings - dealsClosed;
  const totalLeakedDeals = lostConversations + lostMeetings;

  const savedFromConversations =
    lostConversations * salvageRate * meetingRate * closeRate;
  const savedFromMeetings = lostMeetings * salvageRate * closeRate;
  const actualDealsSaved = savedFromConversations + savedFromMeetings;

  const revenueSaved = actualDealsSaved * dealSize;
  const commissionSaved = revenueSaved * commissionRate;
  const valuePerCall = totalCalls > 0 ? totalCommission / totalCalls : 0;

  return {
    salesStaffCount,
    totalConversations,
    totalMeetings,
    dealsClosed,
    totalRevenue,
    totalCommission,
    lostConversations,
    lostMeetings,
    totalLeakedDeals,
    savedFromConversations,
    savedFromMeetings,
    actualDealsSaved,
    revenueSaved,
    commissionSaved,
    valuePerCall,
    teamOutreach: totalCalls * salesStaffCount,
    teamLeakedDeals: totalLeakedDeals * salesStaffCount,
    teamRevenueSaved: revenueSaved * salesStaffCount,
    teamCommissionSaved: commissionSaved * salesStaffCount,
    teamTotalCommission: totalCommission * salesStaffCount,
  };
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNum(n: number, decimals = 1): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
