import type { CouncilProvider, CouncilProviderOutcome } from './provider';
import type { CouncilTurn } from '../domain';
import { applyCompanionSilencePolicies, buildCompanionSilencePolicies } from '../memory/silenceTuning';
import type { SuggestionUsageSignal } from '../memory/usageSignals';

export interface SuggestionOutcomeReader { read(): Promise<readonly SuggestionUsageSignal[]>; }

export class SilenceTunedCouncilProvider implements CouncilProvider {
  constructor(
    private readonly inner: CouncilProvider,
    private readonly outcomes: SuggestionOutcomeReader,
    private readonly enabled: () => boolean
  ) {}

  async review(turn: CouncilTurn, cwd?: string): Promise<CouncilProviderOutcome> {
    const outcome = await this.inner.review(turn, cwd);
    if (!this.enabled()) return outcome;
    const policies = buildCompanionSilencePolicies(await this.outcomes.read());
    const applied = policies.filter((policy) => policy.applied && policy.maxSuggestions < 2);
    if (!applied.length) return {
      ...outcome,
      state: { ...outcome.state, message: `${outcome.state.message} Local silence tuning is enabled, but no role currently qualifies for reduction.` }
    };
    const summary = applied.map((policy) => `${policy.role}≤${policy.maxSuggestions}`).join(', ');
    return {
      review: applyCompanionSilencePolicies(outcome.review, policies),
      state: { ...outcome.state, message: `${outcome.state.message} Local silence tuning applied: ${summary}.` }
    };
  }
}
