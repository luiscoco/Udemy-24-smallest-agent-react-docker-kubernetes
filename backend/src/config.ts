
export interface AgentConfig { apiKey: string; apiKeyConfigured: boolean; model: string; systemPrompt: string; maxTurns: number; trustProxy?: boolean; maxConcurrent?: number; }
export function readConfig(env: Readonly<Record<string, string | undefined>> = process.env): AgentConfig {
  const maxTurns = Number(env.AGENT_MAX_TURNS || 1);
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 10) throw new Error('AGENT_MAX_TURNS must be an integer from 1 to 10');
  const maxConcurrent = Number(env.AGENT_MAX_CONCURRENT_REQUESTS || 2);
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 8) throw new Error('AGENT_MAX_CONCURRENT_REQUESTS must be an integer from 1 to 8');
  const apiKey = (env.ANTHROPIC_API_KEY || '').trim();
  return { maxConcurrent, apiKey, apiKeyConfigured: Boolean(apiKey) && apiKey !== 'sk-ant-replace-with-your-key',
    trustProxy: env.TRUST_PROXY === '1', model: env.CLAUDE_MODEL || '', systemPrompt: env.AGENT_SYSTEM_PROMPT || '', maxTurns };
}
