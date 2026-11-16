import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import powershell from 'highlight.js/lib/languages/powershell';
import bash from 'highlight.js/lib/languages/bash';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';

for (const [name, grammar] of Object.entries({ python, yaml, dockerfile, javascript, typescript, xml, powershell, bash, ini, json })) hljs.registerLanguage(name, grammar);
export function highlightCode(code: string, language = 'javascript') {
  const output = hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : hljs.highlightAuto(code, []).value;
  return typeof window === 'undefined' ? output : DOMPurify.sanitize(output);
}
const markdown = new Marked({ renderer: {
  code: ({ text, lang }) => `<pre><code class="hljs">${highlightCode(text, (lang || '').split(/\s+/)[0])}</code></pre>`,
} });
// React's HTML insertion is safe here only because all generated markup is sanitized.
export function renderMarkdown(text: string): string {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(markdown.parse(text, { async: false }));
}
