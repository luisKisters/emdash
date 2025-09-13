import React, { useEffect, useRef, useMemo } from 'react'
import { Terminal } from '@xterm/xterm'

type Props = {
  id: string
  cwd?: string
  cols?: number
  rows?: number
  shell?: string
  className?: string
}

const TerminalPaneComponent: React.FC<Props> = ({ id, cwd, cols = 80, rows = 24, shell, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const disposeFns = useRef<Array<() => void>>([])

  useEffect(() => {
    
    const el = containerRef.current
    if (!el) {
      console.error('TerminalPane: No container element found')
      return
    }

    console.log('TerminalPane: Creating terminal, container dimensions:', {
      width: el.offsetWidth,
      height: el.offsetHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight
    })

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      disableStdin: false,
      theme: {
        background: '#0b0e14',
      },
    })
    termRef.current = term
    term.open(el)
    term.focus()
    setTimeout(() => term.focus(), 0)
    term.writeln('\x1b[32m[Terminal ready] Click here and type.\x1b[0m')

    const keyDisp = term.onData((data) => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('xterm onData', JSON.stringify(data))
      }
      window.electronAPI.ptyInput({ id, data })
    })
    const keyDisp2 = term.onKey((ev) => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('xterm onKey', ev.key)
      }
    })

    // Start PTY session
    ;(async () => {
      try {
        const res = await window.electronAPI.ptyStart({ id, cwd, cols, rows, shell })
        if (!res?.ok) {
          term.writeln("\x1b[31mFailed to start PTY:\x1b[0m " + (res as any)?.error)
        }
      } catch (e: any) {
        term.writeln("\x1b[31mError starting PTY:\x1b[0m " + (e?.message || String(e)))
      }
    })()

    // PTY -> terminal output
    const offData = window.electronAPI.onPtyData(id, (data) => {
      term.write(data)
    })
    const offExit = window.electronAPI.onPtyExit(id, ({ exitCode }) => {
      term.write(`\r\n\x1b[31m[process exited with code ${exitCode}]\x1b[0m\r\n`)
    })

    disposeFns.current.push(() => keyDisp.dispose())
    disposeFns.current.push(offData)
    disposeFns.current.push(offExit)
    disposeFns.current.push(() => keyDisp2.dispose())

    return () => {
      // Kill PTY and cleanup
      window.electronAPI.ptyKill(id)
      disposeFns.current.forEach((fn) => fn())
      term.dispose()
      termRef.current = null
    }
  }, [id, cwd, cols, rows])

  return (
    <div
      className={className}
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '400px',
        backgroundColor: '#0b0e14'
      }}
      onClick={() => termRef.current?.focus()}
      onMouseDown={() => termRef.current?.focus()}
    >
      <div 
        ref={containerRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          minHeight: '400px'
        }} 
      />
    </div>
  )
}

// Memoize the component to prevent unnecessary re-renders
export const TerminalPane = React.memo(TerminalPaneComponent)

export default TerminalPane
