import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type ListArgs = {
  root: string;
  includeDirs?: boolean;
  maxEntries?: number;
};

type Item = {
  path: string; // relative to root
  type: 'file' | 'dir';
};

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
]);

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function listFiles(root: string, includeDirs: boolean, maxEntries: number): Item[] {
  const items: Item[] = [];
  const stack: string[] = ['.'];

  while (stack.length > 0) {
    const rel = stack.pop() as string;
    const abs = path.join(root, rel);

    const stat = safeStat(abs);
    if (!stat) continue;

    if (stat.isDirectory()) {
      const name = path.basename(abs);
      if (rel !== '.' && DEFAULT_IGNORES.has(name)) continue;

      if (rel !== '.' && includeDirs) {
        items.push({ path: rel, type: 'dir' });
        if (items.length >= maxEntries) break;
      }

      let entries: string[] = [];
      try {
        entries = fs.readdirSync(abs);
      } catch {
        continue;
      }

      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (DEFAULT_IGNORES.has(entry)) continue;
        const nextRel = rel === '.' ? entry : path.join(rel, entry);
        stack.push(nextRel);
      }
    } else if (stat.isFile()) {
      items.push({ path: rel, type: 'file' });
      if (items.length >= maxEntries) break;
    }
  }

  return items;
}

export function registerFsIpc(): void {
  ipcMain.handle('fs:list', async (_event, args: ListArgs) => {
    try {
      const root = args.root;
      const includeDirs = args.includeDirs ?? true;
      const maxEntries = Math.min(Math.max(args.maxEntries ?? 5000, 100), 20000);
      if (!root || !fs.existsSync(root)) {
        return { success: false, error: 'Invalid root path' };
      }
      const items = listFiles(root, includeDirs, maxEntries);
      return { success: true, items };
    } catch (error) {
      console.error('fs:list failed:', error);
      return { success: false, error: 'Failed to list files' };
    }
  });

  ipcMain.handle(
    'fs:read',
    async (_event, args: { root: string; relPath: string; maxBytes?: number }) => {
      try {
        const { root, relPath } = args;
        const maxBytes = Math.min(Math.max(args.maxBytes ?? 200 * 1024, 1024), 5 * 1024 * 1024); // 200KB default, clamp 1KB..5MB
        if (!root || !fs.existsSync(root)) return { success: false, error: 'Invalid root path' };
        if (!relPath) return { success: false, error: 'Invalid relPath' };

        // Resolve and ensure within root
        const abs = path.resolve(root, relPath);
        const normRoot = path.resolve(root) + path.sep;
        if (!abs.startsWith(normRoot)) return { success: false, error: 'Path escapes root' };

        const st = safeStat(abs);
        if (!st) return { success: false, error: 'Not found' };
        if (st.isDirectory()) return { success: false, error: 'Is a directory' };

        const size = st.size;
        let truncated = false;
        let content: string;
        const fd = fs.openSync(abs, 'r');
        try {
          const bytesToRead = Math.min(size, maxBytes);
          const buf = Buffer.alloc(bytesToRead);
          fs.readSync(fd, buf, 0, bytesToRead, 0);
          content = buf.toString('utf8');
          truncated = size > bytesToRead;
        } finally {
          fs.closeSync(fd);
        }

        return { success: true, path: relPath, size, truncated, content };
      } catch (error) {
        console.error('fs:read failed:', error);
        return { success: false, error: 'Failed to read file' };
      }
    }
  );
}
