import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, readEvents } from '../src/api';

afterEach(() => vi.restoreAllMocks());
describe('React API client', () => {
  it('explains how to recover a hosting gateway sign-in requirement', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(api.query('Hi')).rejects.toThrow('hosting gateway requires sign-in');
  });
  it('posts JSON and reads typed result fields', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ result: 'Hi', num_turns: 1, duration_ms: 10, total_cost_usd: null, is_error: false }), { headers: { 'Content-Type': 'application/json' } }));
    expect((await api.query('Hello')).result).toBe('Hi');
    expect(JSON.parse(String(mock.mock.calls[0]?.[1]?.body))).toEqual({ prompt: 'Hello' });
  });
  it('preserves Unicode, CRLF and frames split across single bytes', async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\n\r\nevent: message\r\ndata: {"text":"héllo"}\r\n\r\nevent: done\ndata: {}\n\n');
    const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    const events: { event: string; data: unknown }[] = [];
    await readEvents(body, (event, data) => events.push({ event, data }));
    expect(events).toEqual([{ event: 'message', data: { text: 'héllo' } }, { event: 'done', data: {} }]);
  });
  it('requires done and propagates safe SSE errors', async () => {
    const mock = vi.spyOn(globalThis, 'fetch');
    mock.mockResolvedValueOnce(new Response('event: error\ndata: {"detail":"Try again"}\n\n'));
    await expect(api.stream('Hi', () => {})).rejects.toThrow('Try again');
    mock.mockResolvedValueOnce(new Response('event: message\ndata: {"type":"SystemMessage","summary":"Initialized","data":{}}\n\n'));
    await expect(api.stream('Hi', () => {})).rejects.toThrow('before the agent finished');
  });
  it('rejects a final SSE frame cut off before its delimiter', async () => {
    const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('event: done\ndata: {}'));controller.close();}});
    await expect(readEvents(body,()=>{})).rejects.toThrow('incomplete event');
  });
  it('handles HTTP errors without echoing submitted values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"detail":"Configure the server key"}', { status: 503 }));
    await expect(api.query('Hi')).rejects.toThrow('Configure the server key');
  });
  it('shows stream HTTP error details and falls back to the status for non-JSON responses', async () => {
    const mock = vi.spyOn(globalThis, 'fetch');
    mock.mockResolvedValueOnce(new Response('{"detail":"Origin is not allowed."}', { status: 403 }));
    await expect(api.stream('Hi', () => {})).rejects.toThrow('Origin is not allowed.');
    mock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api.stream('Hi', () => {})).rejects.toThrow('HTTP 502');
  });
});
