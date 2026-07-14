import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getMem0Client, MEM0_AGENT_ID } from "./_mem0.js";

interface MemoryRequestBody {
  userId?: string;
  memoryId?: string;
  text?: string;
}

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const mem0 = getMem0Client();

    if (req.method === "GET") {
      const userId = queryValue(req.query.userId)?.trim();
      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }
      const page = await mem0.getAll({
        filters: { userId, agentId: MEM0_AGENT_ID },
        pageSize: 100,
        latestOnly: true,
      });
      res.status(200).json({ memories: page.results });
      return;
    }

    const body = (req.body ?? {}) as MemoryRequestBody;
    const userId = body.userId?.trim();
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    if (req.method === "PATCH") {
      const memoryId = body.memoryId?.trim();
      const text = body.text?.trim();
      if (!memoryId || !text) {
        res.status(400).json({ error: "memoryId and text are required" });
        return;
      }
      const updated = await mem0.update(memoryId, { text });
      res.status(200).json({ memory: updated[0] ?? null });
      return;
    }

    if (req.method === "DELETE") {
      if (body.memoryId) {
        await mem0.delete(body.memoryId);
      } else {
        await mem0.deleteAll({ userId, agentId: MEM0_AGENT_ID });
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Memory request failed";
    res.status(500).json({ error: message });
  }
}
