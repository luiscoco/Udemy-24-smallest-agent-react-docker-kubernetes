import type { AgentConfig } from "./config.js";
import type { AgentService } from "./agent-service.js";

const FAILURE =
  "The agent could not finish. Check the server API key and model configuration, then try again.";
const MISSING_KEY =
  "Configure ANTHROPIC_API_KEY in backend/.env, then restart the Node agent service.";
const MAX_BODY_BYTES = 32768;
class InputError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function validatePrompt(body: unknown): string | null {
  if (
    !body ||
    typeof body !== "object" ||
    !("prompt" in body) ||
    typeof body.prompt !== "string"
  )
    return null;
  const prompt = body.prompt.trim();
  return prompt.length >= 1 && prompt.length <= 4000 ? prompt : null;
}
async function readPrompt(request: Request, config: AgentConfig): Promise<string> {
  const origin = request.headers.get("origin");
  if (origin) {
    const url = new URL(request.url);
    // Host preserves localhost versus 127.0.0.1; forwarded headers are not trusted.
    const host = request.headers.get("host") || url.host;
    const protocol = config.trustProxy && request.headers.get("x-forwarded-proto") === "https" ? "https:" : url.protocol;
    if (origin !== `${protocol}//${host}`)
      throw new InputError(403, "Origin is not allowed.");
  }
  if ((request.headers.get("content-type") || '').split(";")[0]?.trim().toLowerCase() !== "application/json")
    throw new InputError(415, "Use Content-Type: application/json.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new InputError(
      422,
      "Prompt must contain 1–4000 characters after trimming.",
    );
  let bytes = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      bytes += value?.byteLength || 0;
      // Canceling the adapter's incoming stream destroys its HTTP socket before
      // a 413 can be delivered. Stop buffering and release the lock instead.
      if (bytes > MAX_BODY_BYTES)
        throw new InputError(413, "Request body is too large.");
      text += decoder.decode(value, { stream: !done });
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new InputError(400, "Request must contain valid JSON.");
  }
  const prompt = validatePrompt(body);
  if (prompt === null)
    throw new InputError(
      422,
      "Prompt must contain 1–4000 characters after trimming.",
    );
  return prompt;
}
function inputResponse(error: unknown): Response {
  return Response.json(
    {
      detail:
        error instanceof InputError
          ? error.message
          : "The request could not be processed.",
    },
    { status: error instanceof InputError ? error.status : 400 },
  );
}

export function createHandlers(config: AgentConfig, agent: AgentService) {
  async function query(request: Request): Promise<Response> {
    let prompt: string;
    try {
      prompt = await readPrompt(request, config);
    } catch (error) {
      return inputResponse(error);
    }
    if (!config.apiKeyConfigured)
      return Response.json({ detail: MISSING_KEY }, { status: 503 });
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const deadline = setTimeout(() => controller.abort(), 180000);
    try {
      return Response.json(await agent.runAgent(prompt, controller));
    } catch {
      return Response.json({ detail: FAILURE }, { status: 502 });
    } finally {
      clearTimeout(deadline);
      request.signal.removeEventListener("abort", abort);
    }
  }

  async function stream(request: Request): Promise<Response> {
    let prompt: string;
    try {
      prompt = await readPrompt(request, config);
    } catch (error) {
      return inputResponse(error);
    }
    const encoder = new TextEncoder();
    const controller = new AbortController();
    let closed = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let output: ReadableStreamDefaultController<Uint8Array> | undefined;
    const finish = () => {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      request.signal.removeEventListener("abort", abort);
      if (!closed) {
        closed = true;
        try {
          output?.close();
        } catch {
          /* Reader already canceled. */
        }
      }
    };
    const abort = () => {
      controller.abort();
      finish();
    };
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        output = streamController;
        const sendEvent = (event: string, data: unknown) => {
          if (!closed)
            streamController.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
        };
        if (!config.apiKeyConfigured) {
          sendEvent("error", { detail: MISSING_KEY });
          finish();
          return;
        }
        request.signal.addEventListener("abort", abort, { once: true });
        if (request.signal.aborted) {
          abort();
          return;
        }
        deadline = setTimeout(() => {
          sendEvent("error", {
            detail: "The agent timed out. Try a shorter prompt.",
          });
          abort();
        }, 180000);
        heartbeat = setInterval(() => {
          if (!closed)
            streamController.enqueue(encoder.encode(": keep-alive\n\n"));
        }, 15000);
        void (async () => {
          try {
            for await (const message of agent.streamAgent(prompt, controller))
              sendEvent("message", message);
            sendEvent("done", { status: "complete" });
          } catch {
            sendEvent("error", { detail: FAILURE });
          } finally {
            finish();
          }
        })();
      },
      cancel() {
        abort();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }
  return { query, stream };
}
