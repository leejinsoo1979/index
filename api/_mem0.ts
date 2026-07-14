import MemoryClient from "mem0ai";

let client: MemoryClient | null = null;

export function getMem0Client() {
  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) {
    throw new Error("MEM0_API_KEY is not configured");
  }

  if (!client) {
    client = new MemoryClient({ apiKey });
  }

  return client;
}

export const MEM0_AGENT_ID = "index-ai";
