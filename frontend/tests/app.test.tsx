import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentApp } from '../src/AgentApp';
import type { AgentMessage, AgentResult } from '../src/types';
import { CodeBlock } from '../src/CodeBlock';

const result: AgentResult = { result: '**Hello!**\n```javascript\nconst greeting = "Hello";\n```\n<script>alert(1)</script>', num_turns: 1, duration_ms: 12, total_cost_usd: null, is_error: false };
function makeClient() { return {
  health: vi.fn(async () => ({ status: 'ok' as const, api_key_configured: false })),
  query: vi.fn(async () => result),
  stream: vi.fn(async (_prompt: string, onMessage: (message: AgentMessage) => void, _signal?: AbortSignal) => onMessage({ type: 'ResultMessage', summary: 'Done', data: result })),
}; }
beforeEach(() => { history.replaceState(null, '', '/'); localStorage.clear(); });

describe('React agent playground', () => {
  it('clicks all five tabs, updates active content and retains the lab prompt', async () => {
    const { container } = render(<AgentApp client={makeClient()} />);
    fireEvent.change(screen.getByLabelText('What would you like to ask?'), { target: { value: 'Keep my Kubernetes prompt' } });
    for (const [id, heading] of [
      ['learn', 'Small enough to understand. Real enough to explore.'],
      ['setup', 'React, Docker and Kubernetes. One application.'],
      ['architecture', 'See how the pieces connect.'],
      ['walkthrough', 'One request. Every layer explained.'],
      ['lab', 'Start with a little curiosity.'],
    ]) {
      fireEvent.click(container.querySelector<HTMLAnchorElement>(`.lesson-nav a[href="#${id}"]`)!);
      await waitFor(() => expect(container.querySelector('.lesson-nav [aria-current="page"]')?.getAttribute('href')).toBe(`#${id}`));
      expect(screen.getByRole('heading', { name: heading })).not.toBeNull();
      if (id === 'architecture') expect(container.querySelectorAll('.workflow-code-step')).toHaveLength(16);
    }
    expect(screen.getByLabelText<HTMLTextAreaElement>('What would you like to ask?').value).toBe('Keep my Kubernetes prompt');
  });
  it('starts with Hello world and a missing-key warning', async () => {
    render(<AgentApp client={makeClient()} />);
    expect(screen.getByLabelText<HTMLTextAreaElement>('What would you like to ask?').value).toBe('Hello world!');
    await screen.findByText('API key not configured');
  });
  it('renders a real streamed result, timeline and sanitized highlighted Markdown', async () => {
    const client = makeClient(); const { container } = render(<AgentApp client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /Run agent/ }));
    await waitFor(() => expect(container.querySelector<HTMLElement>('.state')!.textContent).toBe('success'));
    expect(container.querySelector<HTMLElement>('.markdown strong')!.textContent).toBe('Hello!');
    expect(container.querySelector<HTMLElement>('.markdown .hljs-keyword')).not.toBeNull();
    expect(container.querySelector<HTMLElement>('.markdown script')).toBeNull();
    expect(container.querySelectorAll('.timeline-row').length).toBe(1);
    expect(client.stream).toHaveBeenCalledTimes(1);
  });
  it('uses Simple mode and preserves the lab when navigating to all 16 UML explanations', async () => {
    const client = makeClient(); const { container } = render(<AgentApp client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simple' }));
    fireEvent.change(screen.getByLabelText('What would you like to ask?'), { target: { value: 'What is Spring?' } });
    fireEvent.click(screen.getByRole('button', { name: /Run agent/ }));
    await waitFor(() => expect(client.query).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector<HTMLElement>('.state')!.textContent).toBe('success'));
    act(() => { history.replaceState(null, '', '/#architecture'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(container.querySelectorAll('.workflow-code-step').length).toBe(16);
    for (const card of container.querySelectorAll('.workflow-code-step')) {
      expect(card.querySelector('.hljs')).not.toBeNull();
      expect(card.querySelector('.code-heading')!.textContent).toMatch(/(frontend|backend|k8s)\//);
      expect(card.querySelector('.workflow-code-explanation')!.textContent).toContain('How this code explains step');
    }
    expect(container.querySelector<HTMLElement>('a[href="/workflow.puml"]')!.hasAttribute('download')).toBe(true);
    act(() => { history.replaceState(null, '', '/#lab'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(screen.getByLabelText<HTMLTextAreaElement>('What would you like to ask?').value).toBe('What is Spring?');
    expect(container.querySelector<HTMLElement>('.markdown strong')!.textContent).toBe('Hello!');
    expect(client.query).toHaveBeenCalledTimes(1);
  });
  it('rejects incomplete/error runs and remembers the dark theme', async () => {
    const client = makeClient(); client.stream.mockRejectedValueOnce(new Error('Connection lost'));
    const { container } = render(<AgentApp client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /Run agent/ }));
    await waitFor(() => expect(container.querySelector<HTMLElement>('.state')!.textContent).toBe('error'));
    expect(screen.getByRole('alert')!.textContent).toBe('Connection lost');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(localStorage.getItem('agent24-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it('surfaces completion without a final result as failure', async () => {
    const client = makeClient(); client.stream.mockImplementationOnce(async () => {});
    render(<AgentApp client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /Run agent/ }));
    expect((await screen.findByRole('alert'))!.textContent).toContain('without a result');
  });
  it('shows streamed text before completion and keeps final usage', async () => {
    const client=makeClient(); let finish=()=>{};
    client.stream.mockImplementationOnce(async (_prompt,onMessage)=>{
      onMessage({type:'AssistantMessage',summary:'Text',data:{text:'**Partial answer**'}});
      await new Promise<void>(resolve=>{finish=resolve;});
      onMessage({type:'ResultMessage',summary:'Complete',data:result});
    });
    const {container}=render(<AgentApp client={client}/>);
    fireEvent.click(screen.getByRole('button',{name:/Run agent/}));
    await screen.findByText('Partial answer');
    expect(container.querySelector('.state')!.textContent).toBe('running');
    await act(async()=>finish());
    await waitFor(()=>expect(container.querySelector('.state')!.textContent).toBe('success'));
    expect(container.querySelector('.stats')!.textContent).toContain('agent turns');
  });
  it('cancels the underlying request and prevents duplicate submissions', async () => {
    const client=makeClient();let signal:AbortSignal|undefined;
    client.stream.mockImplementationOnce(async (_prompt,_onMessage,incoming)=>{
      signal=incoming;
      await new Promise<void>((_resolve,reject)=>incoming!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
    });
    const {container}=render(<AgentApp client={client}/>);
    fireEvent.click(screen.getByRole('button',{name:/Run agent/}));
    fireEvent.keyDown(screen.getByLabelText('What would you like to ask?'),{key:'Enter',ctrlKey:true});
    expect(client.stream).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:/^Cancel$/}));
    await waitFor(()=>expect(container.querySelector('.state')!.textContent).toBe('idle'));
    expect(signal?.aborted).toBe(true);
  });
  it('retains a model error after transport completion', async () => {
    const client=makeClient();client.stream.mockImplementationOnce(async (_prompt,onMessage)=>onMessage({type:'ResultMessage',summary:'Truncated',data:{...result,is_error:true}}));
    const {container}=render(<AgentApp client={client}/>);
    fireEvent.click(screen.getByRole('button',{name:/Run agent/}));
    await waitFor(()=>expect(container.querySelector('.state')!.textContent).toBe('error'));
    expect(container.querySelector('.markdown')!.textContent).toContain('Hello!');
  });
  it('shows setup instructions for this stack and supports theme-safe code text', async () => {
    history.replaceState(null, '', '/#setup');
    const { container } = render(<AgentApp client={makeClient()} />);
    expect(screen.getByText('React, Docker and Kubernetes. One application.')).not.toBeNull();
    expect(container.textContent).toContain('npm run dev');
    expect(container.textContent).toContain('127.0.0.1:6700');
    await screen.findByText('API key not configured');
  });
});

describe('Code highlighting', () => {
  it('colors JSON syntax for Kubernetes infrastructure walkthroughs', () => {
    const {container}=render(<CodeBlock code={'{"requiresCompatibilities": ["KUBERNETES"]}'} language="json"/>);
    expect(container.querySelector('.hljs-attr')).not.toBeNull();
  });
  it('preserves indentation and colors source without executing markup', () => {
    const code = 'const value = "<img src=x onerror=alert(1)>";\n  // Comment';
    const { container } = render(<CodeBlock code={code} language="javascript" />);
    expect(container.querySelector<HTMLElement>('code')!.textContent).toBe(code);
    expect(container.querySelector<HTMLElement>('.hljs-keyword')).not.toBeNull();
    expect(container.querySelector<HTMLElement>('img, script')).toBeNull();
  });
  it('escapes unknown languages as plain text', () => {
    const code = '<script>alert(1)</script>';
    const { container } = render(<CodeBlock code={code} language="unknown-language" />);
    expect(container.querySelector<HTMLElement>('code')!.textContent).toBe(code);
    expect(container.querySelector<HTMLElement>('script')).toBeNull();
  });
});
