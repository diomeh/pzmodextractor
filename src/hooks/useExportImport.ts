import type { Dispatch } from 'preact/hooks';
import type { AppState } from '../lib/types';
import { buildExportFilename } from '../lib/modLogic';
import { buildExportPayload, parseImportPayload } from '../lib/exportImport';
import type { Action } from './useModExtractor';

export function useExportImport(state: AppState, dispatch: Dispatch<Action>) {
  function exportModlist(): void {
    const payload = buildExportPayload(state);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    dispatch({ type: 'SHOW_TOAST', message: 'Modlist exported.' });
  }

  async function handleImportFile(file: File): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      dispatch({ type: 'SET_ERROR', message: 'Could not read that file — it may not be valid JSON.' });
      return;
    }
    const result = parseImportPayload(raw);
    if (!result.ok) {
      dispatch({ type: 'SET_ERROR', message: result.error });
      return;
    }
    dispatch({ type: 'IMPORT_PAYLOAD', payload: result.payload });
  }

  function triggerImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void handleImportFile(file);
    });
    document.body.appendChild(input);
    input.click();
  }

  return { exportModlist, triggerImport };
}
