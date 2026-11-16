import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiUrl } from './api';
import { isAgentResult, type AgentClient, type AgentResult, type Health, type TimelineMessage } from './types';
import { renderMarkdown } from './code';
import { CodeBlock } from './CodeBlock';
import { Lesson } from './Lesson';

const sections = [ ['lab', 'Application lab'], ['learn', 'What you will learn'], ['setup', 'How to run'], ['architecture', 'Architecture & workflow'], ['walkthrough', 'Code walkthrough'] ] as const;
type Section = typeof sections[number][0];
const examples = ['Hello world!', 'Explain what an AI agent is in one sentence.', 'What is TypeScript?'];
const currentSection = (): Section => sections.find(([id]) => id === location.hash.slice(1))?.[0] || 'lab';

export function AgentApp({ client = api }: { client?: AgentClient }) {
  const [section, setSection] = useState<Section>('lab');
  const [prompt, setPrompt] = useState('Hello world!');
  const [mode, setMode] = useState('stream');
  const [state, setState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [partial, setPartial] = useState('');
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [checked, setChecked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dark, setDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const answer = useMemo(() => renderMarkdown(result?.result || partial), [result, partial]);

  useEffect(() => {
    setSection(currentSection());
    try { setDark(localStorage.getItem('agent24-theme') === 'dark'); } catch { }
    setHydrated(true);
    const onHash = () => { if (location.hash !== '#lesson-content') setSection(currentSection()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('agent24-theme', dark ? 'dark' : 'light'); } catch { }
  }, [dark, hydrated]);
  useEffect(() => {
    const abort = new AbortController();
    client.health(abort.signal).then(data => { setHealth(data); setChecked(true); }).catch(err => {
      if (!(err instanceof Error && err.name === 'AbortError')) { setHealth(null); setChecked(true); }
    });
    return () => abort.abort();
  }, [client]);
  useEffect(() => () => { controller.current?.abort(); clearInterval(timer.current); }, []);
  useEffect(() => { if (notice) { const id = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(id); } }, [notice]);

  async function run(event?: React.SyntheticEvent) {
    event?.preventDefault();
    const trimmed = prompt.trim();
    if (busy.current || !trimmed || trimmed.length > 4000) return;
    busy.current = true;
    setState('running'); setNotice(''); setResult(null); setPartial(''); setMessages([]); setError(''); setElapsed(0);
    const started = performance.now();
    controller.current = new AbortController();
    timer.current = setInterval(() => setElapsed(Math.round(performance.now() - started)), 100);
    const finalResult: { current: AgentResult | null } = { current: null };
    try {
      if (mode === 'stream') {
        await client.stream(trimmed, message => {
          if (message.type === 'AssistantMessage' && 'text' in message.data && typeof message.data.text === 'string') {
            const delta = message.data.text;
            setPartial(delta);
          }
          setMessages(rows => rows.length < 500 ? [...rows, { ...message, elapsed: Math.round(performance.now() - started) }] : rows);
          if (message.type === 'ResultMessage' && isAgentResult(message.data)) { finalResult.current = message.data; setResult(message.data); }
        }, controller.current.signal);
        if (!finalResult.current) throw new Error('The agent finished without a result. Please try again.');
      } else { finalResult.current = await client.query(trimmed, controller.current.signal); setResult(finalResult.current); }
      if (finalResult.current?.is_error) throw new Error('The agent could not complete this prompt. Check the server configuration and try again.');
      setState('success');
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : 'The request failed. Check the server connection and API key.';
        setError(message); setNotice(message); setState('error');
      }
    } finally {
      clearInterval(timer.current); setElapsed(Math.round(performance.now() - started)); busy.current = false;
    }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(result?.result || ''); setNotice('Answer copied'); }
    catch { setNotice('Clipboard unavailable. Select the answer to copy it.'); }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([result?.result || ''], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'claude-answer.md'; link.click(); URL.revokeObjectURL(url);
  }

  function cancel() { controller.current?.abort(); setState('idle'); setNotice('Request cancelled.'); }

  return <>
    <a className="skip-link" href="#lesson-content" onClick={event => { event.preventDefault(); document.getElementById("lesson-content")?.focus(); }}>Skip to lesson content</a>
    <header className="topbar"><a className="brand" href="#lab"><span className="brand-icon">a<span>·</span></span><span>The Smallest Agent<small>CLAUDE AGENT SDK · REACT + DOCKER + KUBERNETES + NODE.JS</small></span></a>
      <div className="header-actions"><span className="health"><i className={health?.status === 'ok' ? 'online' : ''} />{!checked ? 'Checking backend…' : health ? 'Backend connected' : 'Backend offline'}</span>{health && !health.api_key_configured && <span className="warning">API key not configured</span>}<a href={apiUrl('/api/docs')} target="_blank" rel="noopener noreferrer">API docs ↗</a><button onClick={() => setDark(value => !value)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? '☀ Light' : '☾ Dark'}</button></div>
    </header>
    <main>
      <div className="course-hero"><div><span className="eyebrow">LEARN IT. BUILD IT. WATCH IT WORK.</span><h1>Your first agent.<br /><em>A real web application.</em></h1><p className="hero-lead">Explore the smallest Claude application in your browser. Ask a question, follow the messages, and understand every layer of a React + Kubernetes + Node.js application.</p><div className="hero-tags"><span>React + Node.js</span><span>Docker + Kubernetes</span><span>Built for learning</span></div></div><figure className="mascot"><img src="/astronaut.png" alt="Waving course astronaut" width="380" height="483" /><figcaption>A small step into agent development.</figcaption></figure></div>
      <nav className="lesson-nav" aria-label="Application sections">{sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={section === id ? 'page' : undefined}>{label}</a>)}</nav>
      <div id="lesson-content" tabIndex={-1}>
        <section hidden={section !== 'lab'} aria-labelledby="lab-title">
          <div className="section-intro lab-intro"><div><span className="eyebrow">APPLICATION LAB</span><h2 id="lab-title">Start with a little curiosity.</h2><p>One prompt. One agent. See exactly what comes back.</p></div><a className="text-link" href="#setup">Need help getting started? →</a></div>
          <div className="lesson-flow" aria-label="Three steps to try the agent">{[['Ask a question','Start with Hello world!'],['Watch the stream','Inspect safe application events'],['Read the result','Check the answer and metrics']].map(([title,text], i) => <div key={title}><span>0{i+1}</span><strong>{title}</strong><p>{text}</p></div>)}</div>
          <div className="workspace"><div className="left-column">
            <section className="panel" aria-labelledby="prompt-title"><div className="panel-heading"><div><span className="eyebrow">YOUR FIRST CONTAINERIZED CLAUDE APP</span><h2 id="prompt-title">Give your agent a prompt</h2></div></div>
              <form onSubmit={run}><label className="field-label" htmlFor="prompt">What would you like to ask?</label><textarea className="prompt-input" id="prompt" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={state === 'running'} maxLength={4000} rows={5} aria-describedby="prompt-hint" onKeyDown={event => { if (event.ctrlKey && event.key === 'Enter') run(event); }} /><div className="field-hints"><span id="prompt-hint">Keep it simple. Your first agent starts with a question.</span><span>{prompt.trim().length}/4000</span></div>
                <div className="examples"><span>TRY A PROMPT</span>{examples.map(example => <button type="button" className="example" key={example} disabled={state === 'running'} onClick={() => setPrompt(example)}>{example}</button>)}</div>
                <div className="run-toolbar"><div className="mode-toggle" role="group" aria-label="Response mode">{['stream','simple'].map(value => <button key={value} type="button" aria-pressed={mode === value} disabled={state === 'running'} onClick={() => setMode(value)}>{value === 'stream' ? 'Stream' : 'Simple'}</button>)}</div><button type="submit" className="primary" disabled={state === 'running' || !prompt.trim()}>{state === 'running' ? <><span className="spinner" aria-hidden="true" />Running…</> : <>Run agent ↗</>}</button>{state === 'running' && <button type="button" onClick={cancel}>Cancel</button>}</div><div className="run-footnote"><span>{mode === 'stream' ? 'Watch safe SDK messages and completion events' : 'Receive the final answer in one response'}</span><kbd>Ctrl + Enter</kbd></div>
              </form></section>
            <section className="panel answer-panel" aria-labelledby="answer-title" aria-busy={state === 'running'}><div className="panel-heading"><div><span className="eyebrow">02 / OUTPUT</span><h2 id="answer-title">Agent’s answer</h2></div>{result && <><button onClick={copy} aria-label="Copy answer">Copy</button><button onClick={download}>Download .md</button></>}<span className="state" data-state={state}>{state}</span></div>
              {state === 'running' && <div className="loading" role="status"><span className="spinner" aria-hidden="true" /><span>Agent is working<strong>{elapsed} ms</strong></span></div>}
              {error && <p className="error-message" role="alert">{error}</p>}
              {(result || partial) && <div className="markdown" dangerouslySetInnerHTML={{ __html: answer }} />}{result && <><div className="stats"><span><strong>{result.num_turns}</strong>agent turns</span><span><strong>{result.duration_ms}</strong>ms</span><span><strong>{result.total_cost_usd == null ? 'Not reported' : `$${result.total_cost_usd.toFixed(6)}`}</strong>USD</span></div></>}
              {state === 'idle' && <div className="answer-empty"><span aria-hidden="true">✧</span><p>Your next discovery starts with a question.</p><small>Run the agent to see a real answer here. No sample response is preloaded.</small></div>}
            </section></div><StreamInspector messages={messages} mode={mode} /></div>
          <aside className="lesson-note"><strong>The same agent, with a containerized application around it.</strong><p>Your prompt travels through React → Kubernetes Service → Node.js in a Docker Pod → TypeScript Claude Agent SDK → Claude. Each run uses a bounded SDK agent loop with tools disabled and the API key stays on the server. Submitting a prompt may use API credits.</p><a href="#architecture">Explore the architecture →</a></aside>
        </section>
        <Lesson section={section} />
      </div>
      <footer><div><strong>The Smallest Agent · React + Kubernetes + Node.js Edition</strong><p>A small agent at the core. A real application around it.</p></div><a href="https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson01-app" target="_blank" rel="noopener noreferrer">Course design reference ↗</a></footer>
    </main>
    {notice && <div className="snackbar" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>Dismiss</button></div>}
  </>;
}

function StreamInspector({ messages, mode }: { messages: TimelineMessage[]; mode: string }) {
  return <div className="stream-inspector"><section className="panel inspector" aria-labelledby="stream-title"><div className="panel-heading"><div><span className="eyebrow">INSIDE THE AGENT</span><h2 id="stream-title">Message stream</h2></div><span className="count">{messages.length} events</span></div><p className="panel-description">Follow initialization, assistant messages, and the final result from the TypeScript Agent SDK. Expand an event to inspect its safe JSON.</p>
    <div className="timeline" aria-live="polite" aria-relevant="additions">{messages.map((message, index) => <article className="timeline-row" key={index}><span className="timeline-dot" data-type={message.type} /><div className="event-body"><div className="event-heading"><span className="badge" data-type={message.type}>{message.type}</span><time>+{message.elapsed} ms</time></div><p>{message.summary}</p><details><summary>View JSON details</summary><CodeBlock code={JSON.stringify(message.data, null, 2)} language="json" /></details></div></article>)}
      {!messages.length && <div className="empty-stream"><span className="empty-symbol" aria-hidden="true">⌁</span><h3>{mode === 'simple' ? 'Simple mode shows the final answer' : 'Your agent’s journey starts here'}</h3><p>{mode === 'simple' ? 'Switch to Stream before your next run to inspect application events.' : 'Run a prompt in Stream mode to see real messages as they arrive.'}</p><div className="sample-flow" aria-label="Illustrative sequence, not a live result">System <span>→</span> Assistant <span>→</span> Result</div></div>}
    </div></section></div>;
}
