/** A Chromium discard can replace the tab ID while preserving its strip entry. */
export interface TabIdentityState<T> {
  tabMeta: Record<string, T>;
  manualSleep: Record<string, true>;
  focus: { tabId: number } | null;
}

export function remapTabIdentity<T>(state: TabIdentityState<T>, oldId: number, newId: number): void {
  if (oldId === newId) return;
  const oldKey = String(oldId);
  const newKey = String(newId);
  if (state.tabMeta[oldKey] !== undefined) state.tabMeta[newKey] = state.tabMeta[oldKey];
  delete state.tabMeta[oldKey];
  if (state.manualSleep[oldKey]) state.manualSleep[newKey] = true;
  delete state.manualSleep[oldKey];
  if (state.focus?.tabId === oldId) state.focus.tabId = newId;
}
