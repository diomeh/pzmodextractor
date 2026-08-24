import type { APIRoute } from 'astro';

export const prerender = false;

const COLLECTION_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/';
const DETAILS_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
const DETAILS_CHUNK_SIZE = 50;

const WORKSHOP_ID_PATTERN = /Workshop ?ID: (\d*)/gim;
const MOD_ID_PATTERN = /Mod ?ID: (\d*\w*\d*\w*\d*\.*\d*)/gim;

interface CollectionChild {
  publishedfileid: string;
  sortorder?: number;
}

interface PublishedFileDetail {
  publishedfileid: string;
  result: number;
  title?: string;
  preview_url?: string;
  description?: string;
}

interface ModEntry {
  publishedfileid: string;
  title: string;
  previewUrl: string;
  description: string;
  ok: boolean;
  ids: string[];
  names: string[];
}

function extractMatches(text: string, pattern: RegExp): string[] {
  return (text.match(pattern) || [])
    .map((s) => s.split(': ')[1]?.trim())
    .filter((v): v is string => Boolean(v));
}

function extractCollectionId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed).searchParams.get('id');
  } catch {
    return null;
  }
}

async function steamPost(url: string, pairs: [string, string][]) {
  const body = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Steam API request failed: ${res.status}`);
  return res.json();
}

async function getCollectionChildren(collectionId: string): Promise<string[]> {
  const json = await steamPost(COLLECTION_URL, [
    ['collectioncount', '1'],
    ['publishedfileids[0]', collectionId],
  ]);
  const detail = json?.response?.collectiondetails?.[0];
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
    const json = await steamPost(DETAILS_URL, pairs);
    out.push(...((json?.response?.publishedfiledetails as PublishedFileDetail[]) || []));
  }
  return out;
}

export const POST: APIRoute = async ({ request }) => {
  let body: { input?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const collectionId = body.input ? extractCollectionId(body.input) : null;
  if (!collectionId) {
    return new Response(
      JSON.stringify({ error: 'Could not find a collection ID in that URL/ID.' }),
      { status: 400 },
    );
  }

  try {
    const childIds = await getCollectionChildren(collectionId);
    const details = await getPublishedFileDetails(childIds);
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

    return new Response(JSON.stringify({ mods }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
