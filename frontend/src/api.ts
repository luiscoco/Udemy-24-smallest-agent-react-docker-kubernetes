import { isAgentResult, type AgentClient, type AgentMessage, type Health } from './types';
import { authorizedFetch } from './auth';

const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const apiUrl = (path: string) => base + path;

export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: unknown) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 1048576) throw new Error('The API event exceeded the supported size.');
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        let event = 'message'; const data: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (data.length) onEvent(event, JSON.parse(data.join('\n')) as unknown);
      }
      if (done) { if (buffer.trim() && !buffer.trim().startsWith(':')) throw new Error('The API returned an incomplete event.'); break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object'; }
function detail(value: unknown, fallback: string): string { return isRecord(value) && typeof value.detail === 'string' ? value.detail : fallback; }
function messageFrom(value: unknown): AgentMessage {
  const names = ['SystemMessage', 'AssistantMessage', 'UserMessage', 'OtherMessage', 'ResultMessage'];
  if (!isRecord(value) || typeof value.type !== 'string' || !names.includes(value.type) || typeof value.summary !== 'string' || !isRecord(value.data)) throw new Error('The API returned an invalid message.');
  if (value.type === 'ResultMessage' && !isAgentResult(value.data)) throw new Error('The API returned an invalid result.');
  return value as unknown as AgentMessage;
}
async function jsonRequest(url: string, options?: RequestInit): Promise<unknown> {
  const response = await authorizedFetch(apiUrl(url), options);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(detail(data, 'The server could not process this request.'));
  return data;
}
export const api: AgentClient = {
  async health(signal) {
    const data = await jsonRequest('/api/health', { signal });
    if (!isRecord(data) || data.status !== 'ok' || typeof data.api_key_configured !== 'boolean') throw new Error('Invalid health response.');
    return data as unknown as Health;
  },
  async query(prompt, signal) {
    const data = await jsonRequest('/api/agent/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal });
    if (!isAgentResult(data)) throw new Error('The API returned an invalid result.');
    return data;
  },
  async stream(prompt, onMessage, signal) {
    const response = await authorizedFetch(apiUrl('/api/agent/stream'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      throw new Error(detail(data, `The API could not start the stream (HTTP ${response.status}). Check the server and prompt.`));
    }
    if (!response.body) throw new Error('The API returned an empty stream. Please try again.');
    let completed = false, finalReceived = false;
    await readEvents(response.body, (event, data) => {
      if (event === 'error') throw new Error(detail(data, 'The agent failed. Please try again.'));
      if (event === 'done') completed = true;
      if (event === 'message') { const message = messageFrom(data); if (message.type === 'ResultMessage') finalReceived = true; onMessage(message); }
    });
    if (!completed || !finalReceived) throw new Error('The connection ended before the agent finished. Please try again.');
  },
};
