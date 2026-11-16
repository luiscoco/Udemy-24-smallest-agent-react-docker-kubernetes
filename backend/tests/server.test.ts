import { describe, expect, it } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createAgentService, type QueryFactory } from '../src/agent-service';
import { createHandlers } from '../src/handlers';
import { readConfig } from '../src/config';

const secret = 'sk-ant-test-secret';
const config = readConfig({ ANTHROPIC_API_KEY: secret });
function setup(overrides: Partial<typeof config> = {}) {
  let closed = 0, aborted = false;
  const queryFn: QueryFactory = ({ prompt, options }) => {
    expect(options.tools).toEqual([]); expect(options.allowedTools).toEqual([]);
    expect(options.settingSources).toEqual([]); expect(options.skills).toEqual([]);
    expect(options.mcpServers).toEqual({}); expect(options.strictMcpConfig).toBe(true);
    expect(options.persistSession).toBe(false); expect(options.permissionMode).toBe('dontAsk');
    expect(options.maxTurns).toBe(1); expect(prompt).toBe(prompt.trim());
    const message = (value: Record<string, unknown>) => value as unknown as SDKMessage;
    const generator = (async function* () {
      if (prompt === 'fail') throw new Error(`${secret} /private/trace`);
      if (prompt === 'empty') return;
      yield message({ type: 'system', subtype: 'init', api_key: secret, cwd: '/private/path' });
      if (prompt === 'slow') {
        await new Promise<void>(resolve => options.abortController?.signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
        return;
      }
      yield message({ type: 'assistant', message: { model: 'test', content: [{ type: 'text', text: `Hello ${secret}` }, { type: 'thinking', thinking: secret }] } });
      yield message({ type: 'result', subtype: prompt === 'error-result' ? 'error_during_execution' : 'success', result: `**Hello!** ${secret}`, num_turns: 1, duration_ms: 42, total_cost_usd: 0.001, is_error: false, errors: [secret] });
    })();
    return Object.assign(generator, { close: () => { closed++; } });
  };
  const settings = { ...config, ...overrides };
  return { ...createHandlers(settings, createAgentService(settings, queryFn)), closed: () => closed, aborted: () => aborted };
}
function request(body: unknown, init: RequestInit = {}) {
  return new Request('http://localhost:9501/api/agent/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...init });
}

describe('Node Agent Node route services', () => {
  for (const mode of ['query', 'stream'] as const) {
    it(`${mode} rejects invalid prompts before SDK work`, async () => {
      const service = setup();
      for (const body of [{}, { prompt: '' }, { prompt: '  ' }, { prompt: 'x'.repeat(4001) }, { prompt: null }, { prompt: 4 }]) {
        expect((await service[mode](request(body))).status).toBe(422);
      }
      expect(service.closed()).toBe(0);
    });
  }
  it('normalizes the final result with locked-down SDK options', async () => {
    const service = setup();
    const response = await service.query(request({ prompt: ' Hi ' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: '**Hello!** [redacted]', num_turns: 1, duration_ms: 42, total_cost_usd: 0.001, is_error: false });
    expect(service.closed()).toBe(1);
  });
  it('streams safe messages in order and ends with done', async () => {
    const service = setup(); const response = await service.stream(request({ prompt: 'Hi' }));
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const text = await response.text();
    expect(text.match(/event: message/g)?.length).toBe(3);
    expect(text.indexOf('SystemMessage')).toBeLessThan(text.indexOf('AssistantMessage'));
    expect(text.indexOf('ResultMessage')).toBeLessThan(text.indexOf('event: done'));
    expect(text).not.toContain(secret); expect(text).not.toContain('/private/'); expect(text).not.toContain('thinking');
    expect(service.closed()).toBe(1);
  });
  it('sends safe failures and missing-result errors without done', async () => {
    for (const prompt of ['fail', 'empty']) {
      const service = setup();
      const response = await service.query(request({ prompt }));
      expect(response.status).toBe(502); expect(await response.text()).not.toContain(secret);
      const text = await (await service.stream(request({ prompt }))).text();
      expect(text).toContain('event: error'); expect(text).not.toContain('event: done');
      expect(text).not.toContain(secret); expect(text).not.toContain('/private/trace');
    }
  });
  it('respects non-success subtypes and missing credentials', async () => {
    const service = setup();
    expect((await (await service.query(request({ prompt: 'error-result' }))).json()).is_error).toBe(true);
    const missing = setup({ apiKey: '', apiKeyConfigured: false });
    expect((await missing.query(request({ prompt: 'Hi' }))).status).toBe(503);
    expect(await (await missing.stream(request({ prompt: 'Hi' }))).text()).toContain('event: error');
    expect(missing.closed()).toBe(0);
  });
  it('bounds the request body and rejects malformed JSON, wrong content types and origins', async () => {
    const service = setup();
    const malformed = await service.query(request(null, { body: `{broken-${secret}` }));
    expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain(secret);
    expect((await service.query(request({ prompt: 'x'.repeat(40000) }))).status).toBe(413);
    expect((await service.query(request({}, { headers: { 'Content-Type': 'text/plain' } }))).status).toBe(415);
    expect((await service.query(request({ prompt: 'Hi' }, { headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' } }))).status).toBe(403);
  });
  it('reader cancellation aborts the SDK and closes its conversation', async () => {
    const service = setup();
    const response = await service.stream(request({ prompt: 'slow' }));
    const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(service.aborted()).toBe(true); expect(service.closed()).toBe(1);
  });
  for (const mode of ['query', 'stream'] as const) {
    it(`${mode} accepts the actual browser host despite Node Agent loopback normalization`, async () => {
      const service = setup();
      for (const host of ['127.0.0.1:9501', 'localhost:9501', '[::1]:9501']) {
        const headers = { 'Content-Type': 'application/json', Host: host, Origin: `http://${host}` };
        // Request URL is localhost after Node Agent normalization; Host stays intact.
        expect((await service[mode](request({ prompt: '' }, { headers }))).status).toBe(422);
      }
      for (const origin of ['http://localhost:9501', 'http://127.0.0.1:9402', 'https://127.0.0.1:9501', 'https://untrusted.invalid', 'null']) {
        const headers = { 'Content-Type': 'application/json', Host: '127.0.0.1:9501', Origin: origin, 'X-Forwarded-Host': new URL(request({}).url).host };
        expect((await service[mode](request({ prompt: '' }, { headers }))).status).toBe(403);
      }
      expect(service.closed()).toBe(0);
    });
  }
  it('request abort also cancels the running SDK', async () => {
    const service = setup(); const abort = new AbortController();
    const response = await service.stream(request({ prompt: 'slow' }, { signal: abort.signal }));
    const reader = response.body!.getReader(); await reader.read(); abort.abort();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(service.aborted()).toBe(true); expect(service.closed()).toBe(1);
  });
  it('validates private settings without exposing values', () => {
    expect(readConfig({ ANTHROPIC_API_KEY: 'sk-ant-replace-with-your-key' }).apiKeyConfigured).toBe(false);
    expect(() => readConfig({ AGENT_MAX_TURNS: '0' })).toThrow();
  });
});
