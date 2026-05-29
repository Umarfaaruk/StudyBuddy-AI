import { ChatMessage, aiComplete, aiStream } from "./aiService";
import { toast } from "sonner";

const GEMINI_PROXY_URL = "/api/gemini";

interface GeminiRequestOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Executes a Gemini non-streaming text completion via the serverless proxy.
 * Falls back to Groq Llama-3.3 if there's any error (e.g., API key missing or rate limits).
 */
export async function geminiComplete(options: GeminiRequestOptions): Promise<string> {
  const { messages, temperature = 0.5, maxTokens = 4096, signal } = options;

  try {
    const resp = await fetch(GEMINI_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return data?.choices?.[0]?.message?.content || "";
    }

    // If API endpoint fails, throw error to trigger the Groq fallback
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData?.error || `API returned ${resp.status}`);
  } catch (err: any) {
    if (err.name === "AbortError") throw err;
    
    console.warn("[Gemini Service] Gemini failed. Falling back to Groq/Llama...", err);
    // Silent recovery: route to Llama-3.3
    return aiComplete({
      messages,
      temperature,
      maxTokens,
      signal,
    });
  }
}

/**
 * Executes a Gemini streaming text completion.
 * Falls back to Groq/Llama-3.3 if there's any error during stream establishment.
 */
export async function geminiStream(
  options: GeminiRequestOptions,
  onToken: (token: string) => void
): Promise<string> {
  const { messages, temperature = 0.5, maxTokens = 4096, signal } = options;

  try {
    const resp = await fetch(GEMINI_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData?.error || "Failed to establish response stream");
    }

    // Process SSE stream
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.startsWith("data: ")) {
            const jsonStr = line.substring(6);
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const text = parsed?.choices?.[0]?.delta?.content || "";
              if (text) {
                onToken(text);
                fullResponse += text;
              }
            } catch {
              // Partial chunk
            }
          }
        }
        buffer = lines[lines.length - 1];
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  } catch (err: any) {
    if (err.name === "AbortError") throw err;

    console.warn("[Gemini Service] Gemini stream failed. Falling back to Groq stream...", err);
    // Silent recovery: route to Llama-3.3 stream
    return aiStream(
      {
        messages,
        temperature,
        maxTokens,
        signal,
      },
      onToken
    );
  }
}
