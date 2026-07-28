export type ProductLayoutState = Readonly<{
  appliedAt: number;
  version: 1;
}>;

export function shouldOfferProductLayout(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  const state = value as Partial<ProductLayoutState>;
  return state.version !== 1 || typeof state.appliedAt !== 'number' || !Number.isFinite(state.appliedAt);
}

export function createProductLayoutState(now = Date.now()): ProductLayoutState {
  return { version: 1, appliedAt: now };
}
