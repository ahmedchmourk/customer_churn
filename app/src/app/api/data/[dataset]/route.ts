/**
 * GET /api/data/:dataset  ->  serves the analytics engine output (customers | model).
 *
 * Files are read from DATA_DIR at request time (never bundled), so re-running
 * `scripts/analytical_engine.py` - locally or in Docker - is picked up by the
 * report's "Refresh" button without rebuilding the Next.js app.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const DATASETS = new Set(["customers", "model"]);

export async function GET(_req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!DATASETS.has(dataset)) {
    return Response.json({ error: `Unknown dataset '${dataset}'` }, { status: 404 });
  }
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  try {
    const body = await readFile(path.join(dir, `${dataset}.json`), "utf8");
    return new Response(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: `${dataset}.json not found in ${dir}. Run: python scripts/analytical_engine.py` },
      { status: 503 },
    );
  }
}
