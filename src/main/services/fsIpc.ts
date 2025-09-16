import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

type ListArgs = {
  root: string
  includeDirs?: boolean
  maxEntries?: number
}

type Item = {
  path: string // relative to root
  type: 'file' | 'dir'
}

const DEFAULT_IGNORES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.DS_Store',
])

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p)
  } catch {
    return null
  }
}

function listFiles(root: string, includeDirs: boolean, maxEntries: number): Item[] {
  const items: Item[] = []
  const stack: string[] = ['.']

  while (stack.length > 0) {
    const rel = stack.pop() as string
    const abs = path.join(root, rel)

    const stat = safeStat(abs)
    if (!stat) continue

    if (stat.isDirectory()) {
      // Skip ignored directories (only at directory boundaries)
      const name = path.basename(abs)
      if (rel !== '.' && DEFAULT_IGNORES.has(name)) continue

      if (rel !== '.' && includeDirs) {
        items.push({ path: rel, type: 'dir' })
        if (items.length >= maxEntries) break
      }

      let entries: string[] = []
      try {
        entries = fs.readdirSync(abs)
      } catch {
        continue
      }

      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]
        if (DEFAULT_IGNORES.has(entry)) continue
        const nextRel = rel === '.' ? entry : path.join(rel, entry)
        stack.push(nextRel)
      }
    } else if (stat.isFile()) {
      items.push({ path: rel, type: 'file' })
      if (items.length >= maxEntries) break
    }
  }

  return items
}

export function registerFsIpc(): void {
  ipcMain.handle('fs:list', async (_event, args: ListArgs) => {
    try {
      const root = args.root
      const includeDirs = args.includeDirs ?? true
      const maxEntries = Math.min(Math.max(args.maxEntries ?? 5000, 100), 20000)
      if (!root || !fs.existsSync(root)) {
        return { success: false, error: 'Invalid root path' }
      }
      const items = listFiles(root, includeDirs, maxEntries)
      return { success: true, items }
    } catch (error) {
      console.error('fs:list failed:', error)
      return { success: false, error: 'Failed to list files' }
    }
  })
}

