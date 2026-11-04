import { EngineError, getState } from "@/lib/engine";

export const dynamic = "force-dynamic";

// POST { selections: { weather: "rainy", ... } } -> allowed options per question + sentence
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    return Response.json(await getState(body?.selections ?? {}));
  } catch (e) {
    if (e instanceof EngineError) return Response.json({ error: e.message, detail: e.detail }, { status: 422 });
    throw e;
  }
}
