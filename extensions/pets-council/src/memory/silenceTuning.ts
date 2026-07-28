import { COUNCIL_ROLE_IDS, type CouncilReview, type CouncilRoleId } from '../domain';
import type { SuggestionUsageSignal } from './usageSignals';

export const MIN_ROLE_OUTCOMES = 12;

export type CompanionSilencePolicy = Readonly<{
  role: CouncilRoleId;
  outcomes: number;
  accepted: number;
  dismissed: number;
  snoozed: number;
  utility: number;
  maxSuggestions: 0 | 1 | 2;
  applied: boolean;
  reason: string;
}>;

export function buildCompanionSilencePolicies(signals: readonly SuggestionUsageSignal[]): readonly CompanionSilencePolicy[] {
  return COUNCIL_ROLE_IDS.map((role) => policyForRole(role, signals.filter((signal) => signal.role === role)));
}

export function applyCompanionSilencePolicies(
  review: CouncilReview,
  policies: readonly CompanionSilencePolicy[]
): CouncilReview {
  const byRole = new Map(policies.map((policy) => [policy.role, policy]));
  return {
    ...review,
    roles: review.roles.map((roleReview) => {
      const policy = byRole.get(roleReview.role);
      if (!policy?.applied) return roleReview;
      return { ...roleReview, suggestions: roleReview.suggestions.slice(0, policy.maxSuggestions) };
    })
  };
}

export function formatCompanionSilenceReport(policies: readonly CompanionSilencePolicy[]): string {
  const rows = policies.map((policy) => `| ${policy.role} | ${policy.outcomes} | ${policy.accepted} | ${policy.dismissed} | ${policy.snoozed} | ${Math.round(policy.utility * 100)}% | ${policy.applied ? policy.maxSuggestions : 'unchanged'} | ${policy.reason} |`).join('\n');
  return `# Pets Council — Local silence tuning\n\nThis report uses only explicit local suggestion outcomes. Tuning remains inactive until a role has at least ${MIN_ROLE_OUTCOMES} outcomes.\n\n| Role | Outcomes | Accepted | Dismissed | Snoozed | Utility | Max suggestions | Explanation |\n|---|---:|---:|---:|---:|---:|---:|---|\n${rows}\n\nUtility weights: accepted = 1, snoozed = 0.25, dismissed = 0. No data is uploaded.\n`;
}

function policyForRole(role: CouncilRoleId, signals: readonly SuggestionUsageSignal[]): CompanionSilencePolicy {
  const accepted = signals.filter((signal) => signal.action === 'accepted').length;
  const dismissed = signals.filter((signal) => signal.action === 'dismissed').length;
  const snoozed = signals.filter((signal) => signal.action === 'snoozed').length;
  const outcomes = signals.length;
  const utility = outcomes ? (accepted + snoozed * 0.25) / outcomes : 0;
  if (outcomes < MIN_ROLE_OUTCOMES) return { role, outcomes, accepted, dismissed, snoozed, utility, maxSuggestions: 2, applied: false, reason: `Needs ${MIN_ROLE_OUTCOMES - outcomes} more outcomes.` };
  if (utility < 0.15) return { role, outcomes, accepted, dismissed, snoozed, utility, maxSuggestions: 0, applied: true, reason: 'Repeatedly low explicit usefulness; default to silence.' };
  if (utility < 0.45) return { role, outcomes, accepted, dismissed, snoozed, utility, maxSuggestions: 1, applied: true, reason: 'Mixed usefulness; allow at most one suggestion.' };
  return { role, outcomes, accepted, dismissed, snoozed, utility, maxSuggestions: 2, applied: true, reason: 'Strong explicit usefulness; keep the normal limit.' };
}
