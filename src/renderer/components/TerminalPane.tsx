import React, { useEffect, useRef, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { log } from '../lib/logger';

type Props = {
  id: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  shell?: string;
  className?: string;
  variant?: 'dark' | 'light';
  keepAlive?: boolean;
  onActivity?: () => void;
  onStartError?: (message: string) => void;
  onStartSuccess?: () => void;
};

const TerminalPaneComponent: React.FC<Props> = ({
  id,
  cwd,
  cols = 80,
  rows = 24,
  shell,
  className,
  variant = 'dark',
  keepAlive = false,
  onActivity,
  onStartError,
  onStartSuccess,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const disposeFns = useRef<Array<() => void>>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      log.error('TerminalPane: No container element found');
      return;
    }

    log.debug('TerminalPane: Creating terminal, container dimensions:', {
      width: el.offsetWidth,
      height: el.offsetHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
    });

    const isLight = variant === 'light';
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      disableStdin: false,
      cols: cols,
      rows: rows,
      theme: isLight
        ? {
            // Light theme: black text on white bg; keep orange accents
            background: '#ffffff',
            foreground: '#000000',
            cursor: '#000000',
            selectionBackground: '#00000022',
            black: '#000000',
            red: '#000000',
            green: '#000000',
            yellow: '#f59e0b', // keep orange
            blue: '#000000',
            magenta: '#000000',
            cyan: '#000000',
            white: '#000000',
            brightBlack: '#4b5563',
            brightRed: '#000000',
            brightGreen: '#000000',
            brightYellow: '#f59e0b', // keep orange
            brightBlue: '#000000',
            brightMagenta: '#000000',
            brightCyan: '#000000',
            brightWhite: '#000000',
          }
        : {
            // Dark theme (existing strict monochrome)
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff',
            selectionBackground: '#ffffff33',
            black: '#000000',
            red: '#ffffff',
            green: '#ffffff',
            yellow: '#ffffff',
            blue: '#ffffff',
            magenta: '#ffffff',
            cyan: '#ffffff',
            white: '#ffffff',
            brightBlack: '#bfbfbf',
            brightRed: '#ffffff',
            brightGreen: '#ffffff',
            brightYellow: '#ffffff',
            brightBlue: '#ffffff',
            brightMagenta: '#ffffff',
            brightCyan: '#ffffff',
            brightWhite: '#ffffff',
          },
      allowTransparency: false,
      scrollback: 1000,
    });
    termRef.current = term;
    term.open(el);
    term.focus();
    setTimeout(() => term.focus(), 0);

    const keyDisp = term.onData((data) => {
      log.debug('xterm onData', JSON.stringify(data));
      try {
        onActivity && onActivity();
      } catch {}
      window.electronAPI.ptyInput({ id, data });
    });
    const keyDisp2 = term.onKey((ev) => {
      log.debug('xterm onKey', ev.key);
    });

    // Listen for history first, then live data, then start/attach to PTY
    const sanitizeEchoArtifacts = (chunk: string) => {
      try {
        // Strip common terminal response artifacts that sometimes get echoed by TTY in cooked mode
        // Examples observed: "1;2c" (DA response) and similar patterns.
        // 1) Remove proper ANSI DA responses if they appear in output stream
        let s = chunk.replace(/\x1b\[\?\d+(?:;\d+)*c/g, '');
        // 2) Remove bare echoed fragments like "1;2c" or "24;80R" when ESC sequences were stripped by echo
        s = s.replace(/(^|[\s>])\d+(?:;\d+)*[cR](?=$|\s)/g, '$1');
        return s;
      } catch {
        return chunk;
      }
    };

    const offHistory = (window as any).electronAPI.onPtyHistory?.(id, (data: string) => {
      term.write(sanitizeEchoArtifacts(data));
    });
    const offData = window.electronAPI.onPtyData(id, (data) => {
      term.write(sanitizeEchoArtifacts(data));
    });
    const offExit = window.electronAPI.onPtyExit(id, (info) => {
      try {
        // If the process exits very quickly after start, it's likely the CLI wasn't found
        const elapsed = Date.now() - startTsRef.current;
        if (elapsed < 1500 && onStartError) {
          onStartError(`PTY exited early (code ${info?.exitCode ?? 'n/a'})`);
        }
      } catch {}
    });
    const handleResize = () => {
      if (termRef.current && el) {
        const { width, height } = el.getBoundingClientRect();
        const newCols = Math.max(20, Math.floor(width / 9));
        const newRows = Math.max(10, Math.floor(height / 17));

        if (newCols !== cols || newRows !== rows) {
          termRef.current.resize(newCols, newRows);
          window.electronAPI.ptyResize({ id, cols: newCols, rows: newRows });
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(el);

    disposeFns.current.push(() => keyDisp.dispose());
    if (offHistory) disposeFns.current.push(offHistory);
    disposeFns.current.push(offData);
    disposeFns.current.push(offExit);
    disposeFns.current.push(() => keyDisp2.dispose());
    disposeFns.current.push(() => resizeObserver.disconnect());

    // Start PTY session after listeners are attached so we don't miss initial output/history
    const startTsRef = { current: Date.now() } as { current: number };
    (async () => {
      try {
        const res = await window.electronAPI.ptyStart({
          id,
          cwd,
          cols,
          rows,
          shell,
        });
        if (!res?.ok) {
          term.writeln('\x1b[31mFailed to start PTY:\x1b[0m ' + (res as any)?.error);
          try {
            onStartError && onStartError((res as any)?.error || 'Failed to start PTY');
          } catch {}
        }
        if (res?.ok) {
          try {
            onStartSuccess && onStartSuccess();
          } catch {}
        }
      } catch (e: any) {
        term.writeln('\x1b[31mError starting PTY:\x1b[0m ' + (e?.message || String(e)));
        try {
          onStartError && onStartError(e?.message || String(e));
        } catch {}
      }
    })();

    return () => {
      if (!keepAlive) {
        window.electronAPI.ptyKill(id);
      }
      disposeFns.current.forEach((fn) => fn());
      term.dispose();
      termRef.current = null;
    };
  }, [id, cwd, cols, rows, variant, keepAlive, shell]);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '0',
        backgroundColor: variant === 'light' ? '#ffffff' : '#000000',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
      onClick={() => termRef.current?.focus()}
      onMouseDown={() => termRef.current?.focus()}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '0',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};

export const TerminalPane = React.memo(TerminalPaneComponent);

export default TerminalPane;
