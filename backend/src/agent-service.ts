// Only this application module imports the SDK; all client contracts are separate.
import {
  query,
  type Options,
  type SDKMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage, AgentResult, MessageType } from "./types.js";
import type { AgentConfig } from "./config.js";
import { isolatedQuery, sdkEnvironment } from './sdk-runtime.js';

export type QueryFactory = (input: {
  prompt: string;
  options: Options;
}) => AsyncIterable<SDKMessage> & { close?: () => void };
export interface AgentService {
  runAgent(prompt: string, controller?: AbortController): Promise<AgentResult>;
  streamAgent(
    prompt: string,
    controller?: AbortController,
  ): AsyncGenerator<AgentMessage>;
}
export function agentOptions(
  config: AgentConfig,
  abortController: AbortController,
): Options {
  // Verified in SDK 0.3.319: tools=[] removes built-ins; allowedTools only sets auto-approvals.
  return {
    tools: [],
    allowedTools: [],
    permissionMode: "dontAsk",
    settingSources: [],
    skills: [],
    mcpServers: {},
    strictMcpConfig: true,
    plugins: [],
    persistSession: false,
    maxTurns: config.maxTurns,
    abortController,
    ...(config.model ? { model: config.model } : {}),
    ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
    env: sdkEnvironment(config.apiKey),
  };
}

export function createAgentService(
  config: AgentConfig,
  queryFn: QueryFactory = isolatedQuery(query),
): AgentService {
  const redact = (text: string) =>
    config.apiKey ? text.split(config.apiKey).join("[redacted]") : text;
  function resultData(message: SDKResultMessage): AgentResult {
    return {
      result:
        message.subtype === "success"
          ? redact(message.result || "")
          : "The agent could not complete this prompt. Check the server configuration.",
      num_turns: message.num_turns,
      duration_ms: message.duration_ms,
      total_cost_usd: message.total_cost_usd ?? null,
      is_error: message.subtype !== "success" || Boolean(message.is_error),
    };
  }
  async function runAgent(
    prompt: string,
    controller = new AbortController(),
  ): Promise<AgentResult> {
    const conversation = queryFn({
      prompt,
      options: agentOptions(config, controller),
    });
    try {
      for await (const message of conversation) {
        if (message.type === "result") return resultData(message);
      }
      throw new Error("Agent ended without a result");
    } finally {
      conversation.close?.();
    }
  }
  async function* streamAgent(
    prompt: string,
    controller = new AbortController(),
  ): AsyncGenerator<AgentMessage> {
    const conversation = queryFn({
      prompt,
      options: agentOptions(config, controller),
    });
    let foundResult = false;
    try {
      for await (const message of conversation) {
        let type: MessageType = "OtherMessage",
          summary = "SDK lifecycle message received";
        let data: AgentResult | Record<string, unknown> = {};
        if (message.type === "result") {
          foundResult = true;
          type = "ResultMessage";
          const result = resultData(message);
          data = result;
          summary = result.is_error
            ? "Agent finished with an error"
            : "Final answer received";
        } else if (message.type === "system") {
          type = "SystemMessage";
          data = { subtype: redact(message.subtype || "system") };
          summary =
            message.subtype === "init" ? "Agent initialized" : "System update";
        } else if (message.type === "assistant" || message.type === "user") {
          type =
            message.type === "assistant" ? "AssistantMessage" : "UserMessage";
          const content = message.message.content;
          const text =
            typeof content === "string"
              ? content
              : content
                  .filter((block) => block.type === "text")
                  .map((block) => block.text)
                  .join(" ");
          data = {
            text: redact(text),
            ...(message.type === "assistant"
              ? { model: redact(message.message.model) }
              : {}),
          };
          summary = redact(text).slice(0, 160) || "Message received";
        }
        // No raw SDK configuration, thinking, tool inputs, session IDs or environment.
        yield { type, summary, data };
      }
      if (!foundResult) throw new Error("Agent ended without a result");
    } finally {
      conversation.close?.();
    }
  }
  return { runAgent, streamAgent };
}
