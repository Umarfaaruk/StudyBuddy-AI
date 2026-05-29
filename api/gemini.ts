/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from "buffer";

function getApiKey(): string {
  // Support multiple key fallback
  const key = process.env.GEMINI_API_KEY || 
              process.env.VITE_GOOGLE_API_KEY || 
              process.env.VITE_FIREBASE_API_KEY ||
              process.env.VITE_GROQ_API_KEY; // fallback if nothing else is found
  if (!key) {
    throw new Error("Server is missing Google/Gemini API configuration key.");
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
    const { messages, temperature = 0.5, max_tokens = 4096, stream = false } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages must be a non-empty array" });
    }

    // ── Convert OpenAI message history to Gemini API format ──
    let systemPrompt = "";
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = typeof msg.content === "string" ? msg.content : (msg.content[0]?.text || "");
      } else {
        const role = msg.role === "assistant" ? "model" : "user";
        let text = "";
        if (typeof msg.content === "string") {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content.map((c: any) => c.text || "").join(" ");
        }
        contents.push({
          role,
          parts: [{ text }],
        });
      }
    }

    const apiKey = getApiKey();
    const modelName = "gemini-2.5-flash"; // Latest stable, high performance

    const payload: any = {
      contents,
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: max_tokens,
      },
    };

    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    if (stream) {
      const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        return res.status(upstream.status).json({ error: text || "Upstream Gemini streaming error" });
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.startsWith("data: ")) {
            const jsonStr = line.substring(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const textToken = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (textToken) {
                // Return in standard OpenAI/SSE format
                const sseChunk = `data: ${JSON.stringify({
                  choices: [{ delta: { content: textToken } }]
                })}\n\n`;
                res.write(Buffer.from(sseChunk));
              }
            } catch {
              // Partial JSON, skipped
            }
          }
        }
        buffer = lines[lines.length - 1];
      }

      res.write(Buffer.from("data: [DONE]\n\n"));
      res.end();
      return;
    }

    // Non-streaming Mode
    const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data: any = await upstream.json().catch(async () => {
      const text = await upstream.text();
      return { error: { message: text || "Invalid upstream response" } };
    });

    if (!upstream.ok) {
      const message = data?.error?.message || `Upstream Gemini error (${upstream.status})`;
      return res.status(upstream.status).json({ error: message });
    }

    const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const mockOpenAIResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: textOutput,
          },
        },
      ],
    };

    return res.status(200).json(mockOpenAIResponse);
  } catch (error: any) {
    console.error("[Gemini Proxy] Error:", error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
}
