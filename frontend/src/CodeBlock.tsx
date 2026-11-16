
import { useMemo, useState } from 'react';
import { highlightCode } from './code';

export function CodeBlock({ code, language = 'typescript' }: { code: string; language?: string }) {
  const html = useMemo(() => highlightCode(code, language), [code, language]);
  const [notice, setNotice] = useState('');
  async function copy() { try { await navigator.clipboard.writeText(code); setNotice('Copied'); } catch { setNotice('Select the code to copy it.'); } }
  return <div className="code-component"><div className="code-block"><div className="snippet-language">{language === 'ini' ? '.ENV / CONFIGURATION' : language.toUpperCase()} <button type="button" onClick={copy}>Copy code</button><span role="status">{notice}</span></div><pre tabIndex={0} aria-label={`${language} code example`}><code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /></pre></div></div>;
}
