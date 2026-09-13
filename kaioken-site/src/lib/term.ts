/**
 * Terminal transcript renderer.
 * Produces an HTML string rather than markup, ensuring exact monospace column alignment.
 */

export type Row =
  | { t: 'cmd'; text: string }
  | { t: 'gap' }
  | { t: 'note'; text: string }
  | { t: 'accent'; text: string }
  | { t: 'kv'; k: string; v: string; n?: string }
  | { t: 'ok'; k: string; v: string; n?: string }
  | { t: 'bad'; k: string; v: string; n?: string }
  | { t: 'done'; k: string; v: string; n?: string };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const K_WIDTH = 12;

function row(r: Row): string {
  switch (r.t) {
    case 'gap':
      return '<span class="tl tl-gap"></span>';

    case 'cmd':
      return `<span class="tl"><span class="t-pr">$</span> <span class="t-cmd">${esc(r.text)}</span></span>`;

    case 'note':
      return `<span class="tl"><span class="t-ind"></span><span class="t-note">${esc(r.text)}</span></span>`;

    case 'accent':
      return `<span class="tl"><span class="t-ind"></span><span class="t-accent">${esc(r.text)}</span></span>`;

    default: {
      const glyph = r.t === 'ok' || r.t === 'done' ? '✓' : r.t === 'bad' ? '✗' : ' ';
      const note = r.n ? `<span class="t-n">${esc(r.n)}</span>` : '';
      return [
        `<span class="tl tl-${r.t}">`,
        `<span class="t-m t-m-${r.t}">${glyph}</span> `,
        `<span class="t-k t-k-${r.t}">${esc(r.k.padEnd(K_WIDTH, ' '))}</span>`,
        `<span class="t-v">${esc(r.v)}</span>`,
        note,
        '</span>',
      ].join('');
    }
  }
}

export const renderTranscript = (rows: Row[]): string => rows.map(row).join('\n');
