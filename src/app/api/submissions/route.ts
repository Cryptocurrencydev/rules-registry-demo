import { EngineError, recentSubmissions, submit } from "@/lib/engine";

export const dynamic = "force-dynamic";

// POST { selections } -> saved sentence, or 422 with the reason if any selection is not allowed
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    return Response.json(await submit(body?.selections), { status: 201 });
  } catch (e) {
    if (e instanceof EngineError) return Response.json({ error: e.message, detail: e.detail }, { status: 422 });
    throw e;
  }
}

export async function GET() {
  return Response.json({ submissions: await recentSubmissions() });
}
