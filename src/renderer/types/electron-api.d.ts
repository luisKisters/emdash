export {}

declare global {
  interface Window {
    electronAPI: {
      // App info
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>

      // PTY
      ptyStart: (opts: { id: string; cwd?: string; shell?: string; env?: Record<string, string>; cols?: number; rows?: number }) => Promise<{ ok: boolean }>
      ptyInput: (args: { id: string; data: string }) => void
      ptyResize: (args: { id: string; cols: number; rows: number }) => void
      ptyKill: (id: string) => void
      onPtyData: (id: string, listener: (data: string) => void) => () => void
      onPtyExit: (id: string, listener: (info: { exitCode: number; signal?: number }) => void) => () => void
    }
  }
}
