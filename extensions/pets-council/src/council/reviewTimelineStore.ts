import {
  hydrateCouncilReviewTimeline,
  serializeCouncilReviewTimeline,
  type CouncilTurnReviewEntry
} from './reviewTimeline';

export interface ReviewTimelineMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export class CouncilReviewTimelineStore {
  constructor(private readonly memento: ReviewTimelineMemento) {}

  load(workspaceKey: string): readonly CouncilTurnReviewEntry[] {
    return hydrateCouncilReviewTimeline(this.memento.get(storageKey(workspaceKey)));
  }

  async save(workspaceKey: string, entries: readonly CouncilTurnReviewEntry[]): Promise<void> {
    await this.memento.update(storageKey(workspaceKey), serializeCouncilReviewTimeline(entries));
  }

  async clear(workspaceKey: string): Promise<void> {
    await this.memento.update(storageKey(workspaceKey), undefined);
  }
}

function storageKey(workspaceKey: string): string {
  return `councilReviewTimeline:${workspaceKey}`;
}
