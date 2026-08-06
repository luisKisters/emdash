import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IFileSystem } from '@emdash/core/files';
import { ok } from '@emdash/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { detectVerifiers } from './detect-verifiers';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'emdash verifier repo '));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  return root;
}

function packageJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function localFixtureFileSystem(): IFileSystem {
  return {
    glob: (_patterns: string[], options: { cwd: string }) =>
      ok(
        (async function* () {
          const pending = [options.cwd];
          while (pending.length > 0) {
            const directory = pending.pop()!;
            for (const entry of await readdir(directory, { withFileTypes: true })) {
              const absolute = path.join(directory, entry.name);
              if (entry.isDirectory()) pending.push(absolute);
              if (entry.isFile()) yield absolute;
            }
          }
        })()
      ),
    readText: async (absolute: string, options?: { maxBytes?: number }) => {
      const content = await readFile(absolute, 'utf8');
      const maxBytes = options?.maxBytes ?? content.length;
      return ok({
        content: content.slice(0, maxBytes),
        truncated: content.length > maxBytes,
        totalSize: content.length,
      });
    },
    stat: async (absolute: string) => {
      const value = await stat(absolute);
      return ok({
        path: absolute,
        type: value.isDirectory() ? ('directory' as const) : ('file' as const),
        size: value.size,
        mtime: value.mtime,
        ctime: value.ctime,
        mode: value.mode,
      });
    },
  } as unknown as IFileSystem;
}

describe('detectVerifiers', () => {
  it('puts the Summario aggregate first and suppresses only commands that it contains', async () => {
    const root = await fixture({
      'package.json': packageJson({
        scripts: {
          'test:phase': 'pnpm test && pnpm typecheck && pnpm lint && pnpm build',
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          build: 'next build',
          format: 'prettier --check .',
        },
        devDependencies: { convex: '^1', eslint: '^9', typescript: '^6', vitest: '^4' },
      }),
      'pnpm-lock.yaml': '',
      'tsconfig.json': '{}',
      'convex/schema.ts': 'export default {};',
    });

    const result = await detectVerifiers(localFixtureFileSystem(), root, 'codex');

    expect(result.map(({ id }) => id)).toEqual([
      'package:root:test:phase',
      'package:root:format',
      'tool:root:convex',
      'agent-browser',
    ]);
    expect(result[0]).toMatchObject({ command: 'pnpm test:phase', class: 'custom' });
    expect(result[2]).toMatchObject({ command: 'pnpm exec convex deploy --dry-run', class: 'db' });
    expect(result[3]).toEqual({
      id: 'agent-browser',
      class: 'browser',
      label: 'Codex computer use',
      command: 'agent-browser',
      source: 'browser',
    });
  });

  it('detects the executable Notetakr gate without hiding an unrelated verifier', async () => {
    const root = await fixture({
      'package.json': packageJson({
        scripts: { test: 'jest', lint: 'eslint .', typecheck: 'tsc --noEmit' },
        devDependencies: { eslint: '^9', jest: '^30', typescript: '^6' },
      }),
      'package-lock.json': '{}',
      'tsconfig.json': '{}',
      'scripts/verify.sh': '#!/bin/sh\nnpm test\nnpm run lint\n',
    });
    await chmod(path.join(root, 'scripts/verify.sh'), 0o755);

    const result = await detectVerifiers(localFixtureFileSystem(), root, 'claude');

    expect(result.map(({ id }) => id)).toEqual([
      'script:scripts/verify.sh',
      'package:root:typecheck',
      'agent-browser',
    ]);
    expect(result[0]?.command).toBe('./scripts/verify.sh');
    expect(result.at(-1)?.label).toBe('Claude computer use');
  });

  it('uses safe fallback commands and adds CI run lines only for remaining gaps', async () => {
    const root = await fixture({
      'jest.config.js': 'export default {};',
      'pyproject.toml': '[tool.ruff]\nline-length = 100\n',
      'python/pytest.ini': '[pytest]',
      'convex.json': '{}',
      'swift/Package.swift': '.testTarget(name: "CoreTests")',
      'App.xcodeproj/project.pbxproj': `A1 /* AppUITests */ = {
        isa = PBXNativeTarget;
        name = "App UI Tests";
        productType = "com.apple.product-type.bundle.ui-testing";
      };`,
      'Broken.xcodeproj/project.pbxproj':
        'productType = "com.apple.product-type.bundle.ui-testing";',
      '.github/workflows/check.yml': `steps:
        - run: jest --runInBand
        - run: pnpm build
        - run: pnpm lint`,
    });

    const result = await detectVerifiers(localFixtureFileSystem(), root, 'codex');
    const byId = new Map(result.map((verifier) => [verifier.id, verifier]));

    expect(byId.get('tool:root:jest')?.command).toBe('jest --runInBand');
    expect(byId.get('tool:root:ruff')?.command).toBe('ruff check .');
    expect(byId.get('tool:python:pytest')?.command).toBe('cd python && python -m pytest');
    expect(byId.get('tool:swift:swift')?.command).toBe('cd swift && swift test');
    expect(byId.get('tool:root:convex')?.command).toBe('npx convex deploy --dry-run');
    expect(byId.get('tool:root:xcode-ui-tests:App UI Tests')?.command).toBe(
      "xcodebuild test '-only-testing:App UI Tests'"
    );
    expect(result.filter(({ id }) => id.includes('xcode-ui-tests'))).toHaveLength(1);
    expect([...byId.values()].find(({ class: value }) => value === 'build')).toMatchObject({
      command: 'pnpm build',
      source: '.github/workflows/check.yml run',
    });
    expect([...byId.values()].filter(({ source }) => source.includes('check.yml'))).toHaveLength(1);
  });

  it('quotes nested paths and ignores malformed and generated package trees', async () => {
    const root = await fixture({
      'package.json': '{ broken',
      'pnpm-lock.yaml': '',
      'packages/web app/package.json': packageJson({ scripts: { test: 'vitest run' } }),
      'node_modules/copied/package.json': packageJson({ scripts: { lint: 'eslint .' } }),
      'dist/package.json': packageJson({ scripts: { build: 'vite build' } }),
    });

    const result = await detectVerifiers(localFixtureFileSystem(), root, 'codex');

    expect(result.map(({ id }) => id)).toEqual(['package:packages/web app:test', 'agent-browser']);
    expect(result[0]?.command).toBe("cd 'packages/web app' && pnpm test");
  });

  it('uses only IFileSystem paths for an SSH-like project root with no workspace', async () => {
    const root = '/remote/Project Root';
    const files = new Map([
      [`${root}/package.json`, packageJson({ scripts: { test: 'vitest run' } })],
      [`${root}/package-lock.json`, '{}'],
      [
        `${root}/node_modules/generated/package.json`,
        packageJson({ scripts: { lint: 'eslint .' } }),
      ],
    ]);
    const globCwds: string[] = [];
    const remoteFs = {
      glob: (_patterns: string[], options: { cwd: string }) => {
        globCwds.push(options.cwd);
        return ok(
          (async function* () {
            for (const absolute of files.keys()) yield absolute;
          })()
        );
      },
      readText: async (absolute: string) => {
        const content = files.get(absolute);
        return ok({ content: content ?? '', truncated: false, totalSize: content?.length ?? 0 });
      },
      stat: async (absolute: string) =>
        ok({
          path: absolute,
          type: 'file' as const,
          size: files.get(absolute)?.length ?? 0,
          mtime: new Date(0),
          ctime: new Date(0),
          mode: 0o644,
        }),
    } as unknown as IFileSystem;

    const result = await detectVerifiers(remoteFs, root, 'claude');

    expect(globCwds).toEqual([root]);
    expect(result.map(({ id }) => id)).toEqual(['package:root:test', 'agent-browser']);
  });
});
