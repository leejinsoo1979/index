import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getMem0Client, MEM0_AGENT_ID } from "./_mem0.js";
import { verifyFirebaseUser } from "./_firebaseAdmin.js";
import { applyManagedKeys } from "./_apiKeys.js";

interface MemoryRequestBody {
  userId?: string;
  memoryId?: string;
  text?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await applyManagedKeys();
  // The member is taken from the verified Firebase ID token; a userId in the request is ignored.
  let userId: string;
  try {
    userId = (await verifyFirebaseUser(req)).uid;
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "로그인이 필요합니다." });
    return;
  }

  try {
    const mem0 = getMem0Client();
    /** Only memories that belong to this member may be changed. */
    const ownsMemory = async (memoryId: string) => {
      const page = await mem0.getAll({ filters: { userId, agentId: MEM0_AGENT_ID }, pageSize: 100, latestOnly: true });
      return page.results.some((m: { id?: string }) => m.id === memoryId);
    };

    if (req.method === "GET") {
      const page = await mem0.getAll({
        filters: { userId, agentId: MEM0_AGENT_ID },
        pageSize: 100,
        latestOnly: true,
      });
      res.status(200).json({ memories: page.results });
      return;
    }

    const body = (req.body ?? {}) as MemoryRequestBody;

    if (req.method === "PATCH") {
      const memoryId = body.memoryId?.trim();
      const text = body.text?.trim();
      if (!memoryId || !text) {
        res.status(400).json({ error: "memoryId and text are required" });
        return;
      }
      if (!(await ownsMemory(memoryId))) {
        res.status(404).json({ error: "memory not found" });
        return;
      }
      const updated = await mem0.update(memoryId, { text });
      res.status(200).json({ memory: updated[0] ?? null });
      return;
    }

    if (req.method === "DELETE") {
      if (body.memoryId) {
        if (!(await ownsMemory(body.memoryId))) {
          res.status(404).json({ error: "memory not found" });
          return;
        }
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
