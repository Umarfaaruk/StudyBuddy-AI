/* eslint-disable @typescript-eslint/no-explicit-any */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function getApiKey(): string {
  const key = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!key) {
    throw new Error("Server is missing GROQ_API_KEY.");
  }
  return key;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { messages, temperature = 0.7, maxTokens = 4096, stream = false, model } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages must be a non-empty array" });
    }

    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: model || "llama-3.3-70b-versatile",
        messages,
        temperature,
        max_tokens: maxTokens,
        stream,
      }),
    });

    if (stream) {
      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        return res.status(upstream.status).json({ error: text || "Upstream streaming error" });
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");

      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
      return;
    }

    const data: any = await upstream.json().catch(async () => {
      const text = await upstream.text();
      return { error: { message: text || "Invalid upstream response" } };
    });

    if (!upstream.ok) {
      const message = data?.error?.message || `Upstream error (${upstream.status})`;
      return res.status(upstream.status).json({ error: message });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
}
