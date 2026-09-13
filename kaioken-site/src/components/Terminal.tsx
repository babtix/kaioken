import React from 'react';
import { renderTranscript, type Row } from '../lib/term.ts';

interface TerminalProps {
  rows: Row[];
  title?: string;
  status?: string;
  valueWidth?: number;
}

export const Terminal: React.FC<TerminalProps> = ({
  rows,
  title = 'kaioken@local',
  status = 'grounded',
  valueWidth = 22,
}) => {
  const html = renderTranscript(rows);

  return (
    <div className="term" style={{ ['--v-col' as string]: `${valueWidth}ch` }}>
      <div className="term-bar">
        <span className="mono">{title}</span>
        {status && (
          <span className="term-status mono">
            <i />
            {status}
          </span>
        )}
      </div>
      <pre className="term-body">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
};
