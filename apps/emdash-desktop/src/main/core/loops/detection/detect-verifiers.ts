import path from 'node:path';
import type { IFileSystem } from '@emdash/core/files';
import type { LoopProviderId } from '@shared/core/loops/loops';
import type { DetectedVerifier, VerifierClass } from '@shared/core/loops/verifier-catalog';

const MAX_CONFIG_BYTES = 512 * 1024;
const GENERATED_SEGMENTS = new Set([
  '.emdash',
  '.git',
  '.next',
  '_generated',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'out',
  'target',
  'vendor',
]);

const DETECTION_PATTERNS = [
  '**/package.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/package-lock.json',
  '**/npm-shrinkwrap.json',
  '**/bun.lock',
  '**/bun.lockb',
  '**/vitest.config.{js,cjs,mjs,ts,cts,mts}',
  '**/jest.config.{js,cjs,mjs,ts,cts,mts,json}',
  '**/playwright.config.{js,cjs,mjs,ts,cts,mts}',
  '**/cypress.config.{js,cjs,mjs,ts,cts,mts}',
  '**/eslint.config.{js,cjs,mjs,ts,cts,mts}',
  '**/.eslintrc{,.js,.cjs,.json,.yaml,.yml}',
  '**/biome.json',
  '**/biome.jsonc',
  '**/tsconfig.json',
  '**/pytest.ini',
  '**/pyproject.toml',
  '**/ruff.toml',
  '**/.ruff.toml',
  '**/go.mod',
  '**/Cargo.toml',
  '**/Package.swift',
  '**/*.xcodeproj/project.pbxproj',
  '**/convex.json',
  '**/convex/schema.ts',
  '**/scripts/verify*.sh',
  '**/e2e-smoke.sh',
  '**/Tools/design-diff',
  '.github/workflows/*.{yml,yaml}',
  '.gitlab-ci.yml',
] as const;

const PACKAGE_SCRIPTS: ReadonlyArray<{
  name: string;
  class: VerifierClass;
  label: string;
}> = [
  { name: 'test', class: 'unit-test', label: 'Unit tests' },
  { name: 'test:e2e', class: 'e2e', label: 'End-to-end tests' },
  { name: 'lint', class: 'lint', label: 'Lint' },
  { name: 'typecheck', class: 'typecheck', label: 'Typecheck' },
  { name: 'build', class: 'build', label: 'Build' },
  { name: 'format', class: 'format', label: 'Format' },
];

type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

type PackageJson = {
  scripts: Record<string, string>;
  dependencies: Set<string>;
};

type SignalFile = { absolute: string; relative: string };

type Candidate = DetectedVerifier & {
  directory: string;
  coverageTerms: readonly string[];
};

type Aggregate = Candidate & {
  body: string;
};

type RepoPaths = {
  flavor: Pick<typeof path.posix, 'dirname' | 'relative'>;
  root: string;
};

export async function detectVerifiers(
  fileSystem: IFileSystem,
  repoRoot: string,
  provider: LoopProviderId
): Promise<DetectedVerifier[]> {
  const repoPaths = createRepoPaths(repoRoot);
  const files = await findSignalFiles(fileSystem, repoPaths);
  const fileSet = new Set(files.map((file) => file.relative));
  const packages = await readPackages(fileSystem, files, repoPaths);
  const candidates: Candidate[] = [];
  const aggregates = await findAggregates(fileSystem, files, packages, fileSet);

  for (const aggregate of aggregates) {
    if (
      !isCoveredByAggregate(
        aggregate,
        aggregates.filter((value) => value !== aggregate)
      )
    ) {
      candidates.push(aggregate);
    }
  }
  addPackageScripts(candidates, aggregates, packages, fileSet);
  await addToolSignals(candidates, aggregates, fileSystem, files, fileSet, packages);
  await addCiFallbacks(candidates, aggregates, fileSystem, files);

  candidates.push({
    id: 'agent-browser',
    class: 'browser',
    label: provider === 'codex' ? 'Codex computer use' : 'Claude computer use',
    command: 'agent-browser',
    source: 'browser',
    directory: '.',
    coverageTerms: [],
  });

  return deduplicate(candidates).map(
    ({ directory: _directory, coverageTerms: _terms, ...value }) => value
  );
}

function createRepoPaths(root: string): RepoPaths {
  return {
    flavor: path.win32.isAbsolute(root) ? path.win32 : path.posix,
    root,
  };
}

async function findSignalFiles(fileSystem: IFileSystem, paths: RepoPaths): Promise<SignalFile[]> {
  const result = fileSystem.glob([...DETECTION_PATTERNS], { cwd: paths.root, dot: true });
  if (!result.success) return [];

  const files: SignalFile[] = [];
  for await (const absolute of result.data) {
    const relative = normalizeRelative(paths.flavor.relative(paths.root, absolute));
    if (!relative || relative.startsWith('../') || isGenerated(relative)) continue;
    files.push({ absolute, relative });
  }
  return [...new Map(files.map((file) => [file.relative, file])).values()].sort((a, b) =>
    a.relative.localeCompare(b.relative)
  );
}

function normalizeRelative(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isGenerated(relative: string): boolean {
  return relative.split('/').some((segment) => GENERATED_SEGMENTS.has(segment));
}

async function readPackages(
  fileSystem: IFileSystem,
  files: SignalFile[],
  paths: RepoPaths
): Promise<Array<{ relative: string; directory: string; value: PackageJson }>> {
  const packages = await Promise.all(
    files
      .filter((file) => file.relative.endsWith('package.json'))
      .map(async (file) => {
        const content = await readText(fileSystem, file.absolute);
        if (content === null) return null;
        try {
          const parsed: unknown = JSON.parse(content);
          if (!isRecord(parsed)) return null;
          const scripts = isRecord(parsed.scripts)
            ? Object.fromEntries(
                Object.entries(parsed.scripts).filter(
                  (entry): entry is [string, string] => typeof entry[1] === 'string'
                )
              )
            : {};
          const dependencies = new Set<string>();
          for (const key of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
            if (!isRecord(parsed[key])) continue;
            for (const dependency of Object.keys(parsed[key])) dependencies.add(dependency);
          }
          return {
            relative: file.relative,
            directory: normalizeRelative(paths.flavor.dirname(file.relative)) || '.',
            value: { scripts, dependencies },
          };
        } catch {
          return null;
        }
      })
  );
  return packages.filter((value): value is NonNullable<typeof value> => value !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readText(fileSystem: IFileSystem, absolute: string): Promise<string | null> {
  const result = await fileSystem.readText(absolute, { maxBytes: MAX_CONFIG_BYTES });
  return result.success && !result.data.truncated ? result.data.content : null;
}

async function findAggregates(
  fileSystem: IFileSystem,
  files: SignalFile[],
  packages: Awaited<ReturnType<typeof readPackages>>,
  fileSet: Set<string>
): Promise<Aggregate[]> {
  const aggregates: Aggregate[] = [];

  for (const pkg of packages) {
    const body = pkg.value.scripts['test:phase'];
    if (!body) continue;
    const manager = packageManager(pkg.directory, fileSet);
    aggregates.push({
      id: packageId(pkg.directory, 'test:phase'),
      class: 'custom',
      label: labelForDirectory('Phase verification', pkg.directory),
      command: inDirectory(pkg.directory, packageCommand(manager, 'test:phase')),
      source: `${pkg.relative}#scripts.test:phase`,
      directory: pkg.directory,
      coverageTerms: ['test:phase'],
      body: expandPackageScripts(body, pkg.value.scripts),
    });
  }

  for (const file of files) {
    const name = path.posix.basename(file.relative);
    if (!/^verify.*\.sh$/.test(name)) continue;
    const stat = await fileSystem.stat(file.absolute);
    if (!stat.success || stat.data.type !== 'file' || (stat.data.mode & 0o111) === 0) continue;
    const rootPackage = packages.find((pkg) => pkg.directory === '.');
    const body = (await readText(fileSystem, file.absolute)) ?? '';
    aggregates.push({
      id: `script:${file.relative}`,
      class: 'custom',
      label: `Verify (${file.relative})`,
      command: shellArg(`./${file.relative}`),
      source: file.relative,
      directory: '.',
      coverageTerms: [name],
      body: rootPackage ? expandPackageScripts(body, rootPackage.value.scripts) : body,
    });
  }

  return aggregates.sort((a, b) => {
    const aRoot = a.directory === '.' ? 0 : 1;
    const bRoot = b.directory === '.' ? 0 : 1;
    return aRoot - bRoot || a.source.localeCompare(b.source);
  });
}

function expandPackageScripts(body: string, scripts: Record<string, string>): string {
  let expanded = body;
  for (let pass = 0; pass < 2; pass += 1) {
    const referenced = Object.entries(scripts)
      .filter(([name]) => containsCommandTerm(expanded, name))
      .map(([, command]) => command);
    expanded = `${expanded}\n${referenced.join('\n')}`;
  }
  return expanded;
}

function addPackageScripts(
  candidates: Candidate[],
  aggregates: Aggregate[],
  packages: Awaited<ReturnType<typeof readPackages>>,
  files: Set<string>
): void {
  for (const script of PACKAGE_SCRIPTS) {
    for (const pkg of packages) {
      if (!pkg.value.scripts[script.name]) continue;
      const manager = packageManager(pkg.directory, files);
      addCandidate(candidates, aggregates, {
        id: packageId(pkg.directory, script.name),
        class: script.class,
        label: labelForDirectory(script.label, pkg.directory),
        command: inDirectory(pkg.directory, packageCommand(manager, script.name)),
        source: `${pkg.relative}#scripts.${script.name}`,
        directory: pkg.directory,
        coverageTerms: script.name === 'typecheck' ? ['typecheck', 'tsc'] : [script.name],
      });
    }
  }
}

function packageManager(directory: string, files: Set<string>): PackageManager {
  for (const candidate of directory === '.' ? ['.'] : directoryAncestors(directory)) {
    const prefix = candidate === '.' ? '' : `${candidate}/`;
    if (files.has(`${prefix}pnpm-lock.yaml`)) return 'pnpm';
    if (files.has(`${prefix}yarn.lock`)) return 'yarn';
    if (files.has(`${prefix}bun.lock`) || files.has(`${prefix}bun.lockb`)) return 'bun';
    if (files.has(`${prefix}package-lock.json`) || files.has(`${prefix}npm-shrinkwrap.json`)) {
      return 'npm';
    }
  }
  return 'npm';
}

function directoryAncestors(directory: string): string[] {
  const parts = directory.split('/');
  const values: string[] = [];
  while (parts.length > 0) {
    values.push(parts.join('/'));
    parts.pop();
  }
  values.push('.');
  return values;
}

function packageCommand(manager: PackageManager, script: string): string {
  if (manager === 'npm' || manager === 'bun') return `${manager} run ${shellArg(script)}`;
  return `${manager} ${shellArg(script)}`;
}

function packageExec(manager: PackageManager, command: string): string {
  if (manager === 'npm') return `npx --no-install ${command}`;
  if (manager === 'yarn') return `yarn exec ${command}`;
  if (manager === 'bun') return `bun x ${command}`;
  return `pnpm exec ${command}`;
}

function packageId(directory: string, script: string): string {
  return `package:${directory === '.' ? 'root' : directory}:${script}`;
}

function labelForDirectory(label: string, directory: string): string {
  return directory === '.' ? label : `${label} (${directory})`;
}

function inDirectory(directory: string, command: string): string {
  return directory === '.' ? command : `cd ${shellArg(directory)} && ${command}`;
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function addToolSignals(
  candidates: Candidate[],
  aggregates: Aggregate[],
  fileSystem: IFileSystem,
  files: SignalFile[],
  fileSet: Set<string>,
  packages: Awaited<ReturnType<typeof readPackages>>
): Promise<void> {
  const packageByDirectory = new Map(packages.map((pkg) => [pkg.directory, pkg]));

  const add = (
    verifierClass: VerifierClass,
    tool: string,
    label: string,
    directory: string,
    command: string,
    source: string,
    coverageTerms: readonly string[] = [tool]
  ) => {
    if (hasClassInDirectory(candidates, verifierClass, directory)) return;
    addCandidate(candidates, aggregates, {
      id: `tool:${directory === '.' ? 'root' : directory}:${tool}`,
      class: verifierClass,
      label: labelForDirectory(label, directory),
      command: inDirectory(directory, command),
      source,
      directory,
      coverageTerms,
    });
  };

  for (const pkg of packages) {
    const manager = packageManager(pkg.directory, fileSet);
    const dependencies = pkg.value.dependencies;
    const configs = files.filter((file) => directoryOf(file.relative) === pkg.directory);
    const has = (pattern: RegExp) =>
      configs.some((file) => pattern.test(path.posix.basename(file.relative)));

    if (dependencies.has('vitest') || has(/^vitest\.config\./)) {
      add(
        'unit-test',
        'vitest',
        'Vitest',
        pkg.directory,
        packageExec(manager, 'vitest run'),
        pkg.relative
      );
    } else if (dependencies.has('jest') || has(/^jest\.config\./)) {
      add(
        'unit-test',
        'jest',
        'Jest',
        pkg.directory,
        packageExec(manager, 'jest --runInBand'),
        pkg.relative
      );
    }
    if (dependencies.has('@playwright/test') || has(/^playwright\.config\./)) {
      add(
        'e2e',
        'playwright',
        'Playwright',
        pkg.directory,
        packageExec(manager, 'playwright test'),
        pkg.relative
      );
    } else if (dependencies.has('cypress') || has(/^cypress\.config\./)) {
      add(
        'e2e',
        'cypress',
        'Cypress',
        pkg.directory,
        packageExec(manager, 'cypress run'),
        pkg.relative
      );
    }
    if (dependencies.has('eslint') || has(/^eslint\.config\./) || has(/^\.eslintrc(?:\.|$)/)) {
      add(
        'lint',
        'eslint',
        'ESLint',
        pkg.directory,
        packageExec(manager, 'eslint .'),
        pkg.relative
      );
    } else if (dependencies.has('@biomejs/biome') || has(/^biome\.jsonc?$/)) {
      add(
        'lint',
        'biome',
        'Biome',
        pkg.directory,
        packageExec(manager, 'biome check .'),
        pkg.relative
      );
    }
    if (
      dependencies.has('typescript') &&
      fileSet.has(atDirectory(pkg.directory, 'tsconfig.json'))
    ) {
      add(
        'typecheck',
        'typescript',
        'TypeScript',
        pkg.directory,
        packageExec(manager, 'tsc --noEmit'),
        pkg.relative,
        ['typescript', 'tsc', 'typecheck']
      );
    }
    if (
      dependencies.has('convex') ||
      fileSet.has(atDirectory(pkg.directory, 'convex.json')) ||
      fileSet.has(atDirectory(pkg.directory, 'convex/schema.ts'))
    ) {
      add('db', 'convex', 'Convex', pkg.directory, 'npx convex deploy --dry-run', pkg.relative);
    }
  }

  for (const file of files) {
    const directory = directoryOf(file.relative);
    const name = path.posix.basename(file.relative);
    if (name === 'pytest.ini') {
      add('unit-test', 'pytest', 'Pytest', directory, 'python -m pytest', file.relative);
    } else if (name === 'ruff.toml' || name === '.ruff.toml') {
      add('lint', 'ruff', 'Ruff', directory, 'ruff check .', file.relative);
    } else if (name === 'pyproject.toml') {
      const content = await readText(fileSystem, file.absolute);
      if (content && /(?:\[tool\.pytest|\bpytest\b)/i.test(content)) {
        add('unit-test', 'pytest', 'Pytest', directory, 'python -m pytest', file.relative);
      }
      if (content && /(?:\[tool\.ruff|\bruff\b)/i.test(content)) {
        add('lint', 'ruff', 'Ruff', directory, 'ruff check .', file.relative);
      }
    } else if (name === 'go.mod') {
      add('unit-test', 'go', 'Go tests', directory, 'go test ./...', file.relative);
    } else if (name === 'Cargo.toml') {
      add('unit-test', 'cargo', 'Cargo tests', directory, 'cargo test', file.relative);
    } else if (name === 'Package.swift') {
      const content = await readText(fileSystem, file.absolute);
      if (content?.includes('.testTarget')) {
        add('unit-test', 'swift', 'Swift tests', directory, 'swift test', file.relative);
      }
    } else if (name === 'project.pbxproj') {
      const content = await readText(fileSystem, file.absolute);
      const target = content ? findXcodeUiTestTargets(content)[0] : undefined;
      if (target) {
        const projectDirectory = directoryOf(directory);
        add(
          'e2e',
          `xcode-ui-tests:${target}`,
          `Xcode UI tests (${target})`,
          projectDirectory,
          `xcodebuild test ${shellArg(`-only-testing:${target}`)}`,
          file.relative,
          ['xcodebuild', target]
        );
      }
    } else if (name === 'e2e-smoke.sh') {
      const stat = await fileSystem.stat(file.absolute);
      if (stat.success && stat.data.type === 'file' && (stat.data.mode & 0o111) !== 0) {
        add(
          'e2e',
          'e2e-smoke',
          'E2E smoke test',
          '.',
          shellArg(`./${file.relative}`),
          file.relative,
          ['e2e-smoke']
        );
      }
    } else if (name === 'design-diff' && directory === 'Tools') {
      const stat = await fileSystem.stat(file.absolute);
      if (stat.success && stat.data.type === 'file' && (stat.data.mode & 0o111) !== 0) {
        addCandidate(candidates, aggregates, {
          id: 'tool:root:design-diff',
          class: 'custom',
          label: 'Design diff',
          command: './Tools/design-diff',
          source: file.relative,
          directory: '.',
          coverageTerms: ['design-diff'],
        });
      }
    }
  }

  // Config-only JavaScript repositories can have no readable package.json.
  for (const file of files) {
    const directory = directoryOf(file.relative);
    const name = path.posix.basename(file.relative);
    const isConvexSchema = name === 'schema.ts' && path.posix.basename(directory) === 'convex';
    if (name === 'convex.json' || isConvexSchema) {
      const convexDirectory = isConvexSchema ? directoryOf(directory) : directory;
      if (!packageByDirectory.has(convexDirectory)) {
        add(
          'db',
          'convex',
          'Convex',
          convexDirectory,
          'npx convex deploy --dry-run',
          file.relative
        );
      }
    }
    if (packageByDirectory.has(directory)) continue;
    if (/^vitest\.config\./.test(name)) {
      add('unit-test', 'vitest', 'Vitest', directory, 'vitest run', file.relative);
    }
    if (/^jest\.config\./.test(name)) {
      add('unit-test', 'jest', 'Jest', directory, 'jest --runInBand', file.relative);
    }
    if (/^playwright\.config\./.test(name)) {
      add('e2e', 'playwright', 'Playwright', directory, 'playwright test', file.relative);
    }
    if (/^cypress\.config\./.test(name)) {
      add('e2e', 'cypress', 'Cypress', directory, 'cypress run', file.relative);
    }
    if (/^eslint\.config\./.test(name) || /^\.eslintrc(?:\.|$)/.test(name)) {
      add('lint', 'eslint', 'ESLint', directory, 'eslint .', file.relative);
    }
    if (/^biome\.jsonc?$/.test(name)) {
      add('lint', 'biome', 'Biome', directory, 'biome check .', file.relative);
    }
  }
}

function findXcodeUiTestTargets(content: string): string[] {
  const targets = new Set<string>();
  for (const match of content.matchAll(/\b[A-F0-9]+ \/\*[^\n]*\*\/ = \{([\s\S]*?)\n\s*\};/g)) {
    const block = match[1] ?? '';
    if (!/\bisa = PBXNativeTarget;/.test(block)) continue;
    if (!/\bproductType = "?com\.apple\.product-type\.bundle\.ui-testing"?;/.test(block)) {
      continue;
    }
    const name = block
      .match(/\bname = (?:"([^"]+)"|([^;]+));/)
      ?.slice(1)
      .find(Boolean)
      ?.trim();
    if (name && /^[A-Za-z0-9_. -]+$/.test(name)) targets.add(name);
  }
  return [...targets].sort((a, b) => a.localeCompare(b));
}

function directoryOf(relative: string): string {
  const directory = path.posix.dirname(relative);
  return directory === '' ? '.' : directory;
}

function atDirectory(directory: string, name: string): string {
  return directory === '.' ? name : `${directory}/${name}`;
}

function hasClassInDirectory(
  candidates: Candidate[],
  verifierClass: VerifierClass,
  directory: string
): boolean {
  return candidates.some(
    (candidate) => candidate.class === verifierClass && candidate.directory === directory
  );
}

function addCandidate(
  candidates: Candidate[],
  aggregates: Aggregate[],
  candidate: Candidate
): void {
  if (!isCoveredByAggregate(candidate, aggregates)) candidates.push(candidate);
}

function isCoveredByAggregate(candidate: Candidate, aggregates: Aggregate[]): boolean {
  return aggregates.some((aggregate) => {
    if (aggregate.id === candidate.id) return false;
    const body = aggregate.body.toLowerCase();
    const terms = candidate.coverageTerms.map((term) => term.toLowerCase());
    if (terms.length === 0 || !terms.some((term) => containsCommandTerm(body, term))) return false;
    if (aggregate.directory === candidate.directory) return true;
    return referencesDirectory(body, candidate.directory);
  });
}

function containsCommandTerm(body: string, term: string): boolean {
  const escaped = escapeRegex(term);
  return new RegExp(`(^|[^a-z0-9:_-])${escaped}(?=$|[^a-z0-9:_-])`, 'i').test(body);
}

function referencesDirectory(body: string, directory: string): boolean {
  if (directory === '.') return false;
  const escaped = escapeRegex(directory.toLowerCase());
  return new RegExp(`(?:\\bcd\\s+|--(?:dir|cwd)\\s+)["']?${escaped}(?:["']|\\s|$)`, 'i').test(body);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function addCiFallbacks(
  candidates: Candidate[],
  aggregates: Aggregate[],
  fileSystem: IFileSystem,
  files: SignalFile[]
): Promise<void> {
  const ciFiles = files.filter(
    (file) => file.relative.startsWith('.github/workflows/') || file.relative === '.gitlab-ci.yml'
  );
  for (const file of ciFiles) {
    const content = await readText(fileSystem, file.absolute);
    if (!content) continue;
    let index = 0;
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:-\s*)?run:\s*(.+?)\s*$/);
      if (!match) continue;
      const command = stripYamlQuotes(match[1]!);
      const verifierClass = classifyCiCommand(command);
      if (!verifierClass || candidates.some((candidate) => candidate.class === verifierClass)) {
        continue;
      }
      index += 1;
      addCandidate(candidates, aggregates, {
        id: `ci:${file.relative}:${index}`,
        class: verifierClass,
        label: `CI ${labelForClass(verifierClass)}`,
        command,
        source: `${file.relative} run`,
        directory: '.',
        coverageTerms: coveredTerms(command),
      });
    }
  }
}

function classifyCiCommand(command: string): VerifierClass | null {
  return coveredClasses(command).find((value) => value !== 'db') ?? null;
}

function coveredClasses(command: string): VerifierClass[] {
  const normalized = command.toLowerCase();
  const patterns: ReadonlyArray<[VerifierClass, RegExp]> = [
    [
      'unit-test',
      /(?:\bvitest\b|\bjest\b|\bpytest\b|\bgo test\b|\bcargo test\b|\bswift test\b|\btest\b(?![:\w-]))/,
    ],
    ['e2e', /(?:test:e2e|playwright|cypress|e2e-smoke|xcodebuild)/],
    ['lint', /(?:\blint\b|eslint|biome check|ruff check)/],
    ['typecheck', /(?:typecheck|tsc\b)/],
    ['build', /(?:\bbuild\b|cargo build|swift build)/],
    ['format', /(?:\bformat\b|biome format|prettier)/],
    ['db', /(?:\bconvex\b|\bdb:)/],
  ];
  return patterns.filter(([, pattern]) => pattern.test(normalized)).map(([value]) => value);
}

function coveredTerms(command: string): string[] {
  return command
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/)
    .filter((value) => value.length > 2);
}

function stripYamlQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function labelForClass(verifierClass: VerifierClass): string {
  return (
    {
      'unit-test': 'unit tests',
      e2e: 'end-to-end tests',
      lint: 'lint',
      typecheck: 'typecheck',
      build: 'build',
      format: 'format',
      browser: 'browser',
      db: 'database verification',
      custom: 'verification',
    } as const
  )[verifierClass];
}

function deduplicate(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}
