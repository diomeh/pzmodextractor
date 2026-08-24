import type { APIRoute } from 'astro';
import { extractCollectionId, resolveCollection } from '../../lib/server/steamApi';

export const prerender = false;

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
    const { mods, source } = await resolveCollection(body.input as string);
    return new Response(JSON.stringify({ mods, source }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
