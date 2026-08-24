import type { ModEntry } from './types';

export async function fetchSourceFromApi(
  token: string,
): Promise<{ mods: ModEntry[]; source?: { id: string; title: string; url: string } }> {
  const res = await fetch('/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: token }),
  });
  const data: { mods?: ModEntry[]; source?: { id: string; title: string; url: string }; error?: string } =
    await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return { mods: data.mods || [], source: data.source };
}
