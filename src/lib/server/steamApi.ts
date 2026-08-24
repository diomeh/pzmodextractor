const COLLECTION_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/';
const DETAILS_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
const DETAILS_CHUNK_SIZE = 50;

export const WORKSHOP_ID_PATTERN = /Workshop ?ID: (\d*)/gim;
export const MOD_ID_PATTERN = /Mod ?ID: (\d*\w*\d*\w*\d*\.*\d*)/gim;

interface CollectionChild {
  publishedfileid: string;
  sortorder?: number;
}

interface CollectionDetail {
  result: number;
  children?: CollectionChild[];
}

interface SteamCollectionDetailsResponse {
  response: {
    collectiondetails?: CollectionDetail[];
  };
}

interface SteamPublishedFileDetailsResponse {
  response: {
    publishedfiledetails?: PublishedFileDetail[];
  };
}

interface PublishedFileDetail {
  publishedfileid: string;
  result: number;
  title?: string;
  preview_url?: string;
  description?: string;
}

export interface ModEntry {
  publishedfileid: string;
  title: string;
  previewUrl: string;
  description: string;
  ok: boolean;
  ids: string[];
  names: string[];
}

export interface SourceInfo {
  id: string;
  title: string;
  url: string;
}

export function extractMatches(text: string, pattern: RegExp): string[] {
  return (text.match(pattern) || [])
    .map((s) => s.split(': ')[1]?.trim())
    .filter((v): v is string => Boolean(v));
}

export function extractCollectionId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed).searchParams.get('id');
  } catch {
    return null;
  }
}

async function steamPost<T>(url: string, pairs: [string, string][]): Promise<T> {
  const body = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Steam API request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function getCollectionChildren(collectionId: string): Promise<string[]> {
  const json = await steamPost<SteamCollectionDetailsResponse>(COLLECTION_URL, [
    ['collectioncount', '1'],
    ['publishedfileids[0]', collectionId],
  ]);
  const detail = json.response?.collectiondetails?.[0];
  if (!detail || detail.result !== 1 || !Array.isArray(detail.children)) {
    throw new Error('That is not a Steam Workshop collection, or it has no items.');
  }
  return (detail.children as CollectionChild[])
    .slice()
    .sort((a, b) => (a.sortorder ?? 0) - (b.sortorder ?? 0))
    .map((c) => c.publishedfileid);
}

async function getPublishedFileDetails(ids: string[]): Promise<PublishedFileDetail[]> {
  const out: PublishedFileDetail[] = [];
  for (let i = 0; i < ids.length; i += DETAILS_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + DETAILS_CHUNK_SIZE);
    const pairs: [string, string][] = [['itemcount', String(chunk.length)]];
    chunk.forEach((id, idx) => pairs.push([`publishedfileids[${idx}]`, id]));
    const json = await steamPost<SteamPublishedFileDetailsResponse>(DETAILS_URL, pairs);
    out.push(...(json.response?.publishedfiledetails || []));
  }
  return out;
}

export async function resolveCollection(input: string): Promise<{ mods: ModEntry[]; source: SourceInfo }> {
  const collectionId = extractCollectionId(input);
  if (!collectionId) {
    throw new Error('Could not find a collection ID in that URL/ID.');
  }

  const childIds = await getCollectionChildren(collectionId);
  const detailIds = childIds.includes(collectionId) ? childIds : [collectionId, ...childIds];
  const details = await getPublishedFileDetails(detailIds);
  const detailsById = new Map(details.map((d) => [d.publishedfileid, d]));

  const mods: ModEntry[] = childIds.map((id) => {
    const detail = detailsById.get(id);
    const desc = detail?.description || '';
    return {
      publishedfileid: id,
      title: detail?.title || `Unknown item ${id}`,
      previewUrl: detail?.preview_url || '',
      description: desc,
      ok: detail?.result === 1,
      ids: extractMatches(desc, WORKSHOP_ID_PATTERN),
      names: extractMatches(desc, MOD_ID_PATTERN),
    };
  });

  const collectionDetail = detailsById.get(collectionId);
  const source: SourceInfo = {
    id: collectionId,
    title: collectionDetail?.title || `Workshop item ${collectionId}`,
    url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${collectionId}`,
  };

  return { mods, source };
}
