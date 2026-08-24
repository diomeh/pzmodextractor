import type { AppState, CuratedItem, ExportedSource, ModEntry, ModExtractorExportPayload } from './types';

const EXPORT_SCHEMA_VERSION = 3;

export function buildExportPayload(state: AppState): ModExtractorExportPayload {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sources: state.sources.map((s) => ({
      key: s.key,
      kind: s.kind,
      title: s.title,
      sourceId: s.sourceId,
      url: s.url,
      items: s.items,
      fetchedAt: s.fetchedAt,
    })),
    curated: state.curated,
    b42Format: state.b42Format,
  };
}

export function isModEntry(value: unknown): value is ModEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.publishedfileid === 'string' &&
    typeof v.title === 'string' &&
    typeof v.previewUrl === 'string' &&
    typeof v.description === 'string' &&
    typeof v.ok === 'boolean' &&
    Array.isArray(v.ids) &&
    v.ids.every((x) => typeof x === 'string') &&
    Array.isArray(v.names) &&
    v.names.every((x) => typeof x === 'string')
  );
}

export function isCuratedItem(value: unknown): value is CuratedItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === 'string' &&
    typeof v.publishedfileid === 'string' &&
    typeof v.title === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.sources) &&
    v.sources.every((x) => typeof x === 'string')
  );
}

export function isExportedSource(value: unknown): value is ExportedSource {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === 'string' &&
    (v.kind === 'collection' || v.kind === 'custom') &&
    typeof v.title === 'string' &&
    (v.sourceId === null || typeof v.sourceId === 'string') &&
    typeof v.url === 'string' &&
    Array.isArray(v.items) &&
    v.items.every(isModEntry) &&
    (v.fetchedAt === null || typeof v.fetchedAt === 'string')
  );
}

export function parseImportPayload(
  raw: unknown,
): { ok: true; payload: ModExtractorExportPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: "This doesn't look like a PZ Mod Extractor export file." };
  }
  const v = raw as Record<string, unknown>;

  if (typeof v.schemaVersion !== 'number') {
    return { ok: false, error: "This doesn't look like a PZ Mod Extractor export file." };
  }
  if (v.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    return { ok: false, error: "This file was exported from an incompatible version of this tool and can't be imported." };
  }
  if (!Array.isArray(v.sources) || !v.sources.every(isExportedSource)) {
    return { ok: false, error: 'Import file is malformed (invalid source entry).' };
  }
  if (!Array.isArray(v.curated) || !v.curated.every(isCuratedItem)) {
    return { ok: false, error: 'Import file is malformed (invalid curated entry).' };
  }
  if (typeof v.exportedAt !== 'string' || typeof v.b42Format !== 'boolean') {
    return { ok: false, error: 'Import file is missing required fields.' };
  }

  return {
    ok: true,
    payload: {
      schemaVersion: v.schemaVersion,
      exportedAt: v.exportedAt,
      sources: v.sources as ExportedSource[],
      curated: v.curated as CuratedItem[],
      b42Format: v.b42Format,
    },
  };
}
