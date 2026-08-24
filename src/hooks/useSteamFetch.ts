import type { Dispatch } from 'preact/hooks';
import type { AppState } from '../lib/types';
import { classifyInput } from '../lib/modLogic';
import { fetchSourceFromApi } from '../lib/steamClient';
import type { Action } from './useModExtractor';

export function useSteamFetch(state: AppState, dispatch: Dispatch<Action>) {
  async function submit(): Promise<void> {
    const value = state.inputValue.trim();
    if (!value || state.loading) return;

    const cls = classifyInput(value);
    if (cls.collections.length === 0 && cls.items.length === 0) {
      dispatch({ type: 'SET_ERROR', message: 'No Workshop collection or item ID found in that input.' });
      return;
    }

    dispatch({ type: 'SUBMIT_START' });

    const [collectionResults, itemResults] = await Promise.all([
      Promise.allSettled(cls.collections.map((token) => fetchSourceFromApi(token))),
      Promise.allSettled(cls.items.map((token) => fetchSourceFromApi(token))),
    ]);

    dispatch({ type: 'SUBMIT_RESULT', cls, collectionResults, itemResults });
  }

  async function addToCustom(key: string): Promise<void> {
    const source = state.sources.find((s) => s.key === key);
    if (!source) return;
    const token = source.draft.trim();
    if (!token || source.draftLoading) return;

    dispatch({ type: 'ADD_TO_CUSTOM_START', key });

    try {
      const { mods } = await fetchSourceFromApi(token);
      const mod = mods[0];
      if (!mod) throw new Error('No item found for that link or ID.');
      dispatch({ type: 'ADD_TO_CUSTOM_SUCCESS', key, mod });
    } catch (err) {
      dispatch({
        type: 'ADD_TO_CUSTOM_ERROR',
        key,
        error: err instanceof Error ? err.message : 'Failed to load that item.',
      });
    }
  }

  return { submit, addToCustom };
}
