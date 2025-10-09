export type UiProvider = 'codex' | 'claude' | 'droid' | 'gemini' | 'cursor' | 'copilot';

export type ProviderMeta = {
  label: string;
  icon?: string; // import path to image asset
  terminalOnly: boolean;
  cli?: string; // command to launch in TerminalPane, for terminal-only providers
  helpUrl?: string; // docs link for terminal-only providers
};

export const providerMeta: Record<UiProvider, ProviderMeta> = {
  codex: {
    label: 'Codex',
    icon: '../../assets/images/openai.png',
    terminalOnly: true,
    cli: 'codex',
    helpUrl: 'https://developers.openai.com/codex/quickstart',
  },
  claude: {
    label: 'Claude Code',
    icon: '../../assets/images/claude.png',
    terminalOnly: true,
    cli: 'claude',
    helpUrl: 'https://docs.claude.com/en/docs/claude-code/quickstart',
  },
  droid: {
    label: 'Droid',
    icon: '../../assets/images/factorydroid.png',
    terminalOnly: true,
    cli: 'droid',
    helpUrl: 'https://docs.factory.ai/cli/getting-started/quickstart',
  },
  gemini: {
    label: 'Gemini',
    icon: '../../assets/images/gemini.png',
    terminalOnly: true,
    cli: 'gemini',
    helpUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  cursor: {
    label: 'Cursor',
    icon: '../../assets/images/cursorlogo.png',
    terminalOnly: true,
    cli: 'cursor-agent',
    helpUrl: 'https://cursor.com/install',
  },
  copilot: {
    label: 'Copilot',
    icon: '../../assets/images/ghcopilot.png',
    terminalOnly: true,
    cli: 'copilot',
    helpUrl: 'https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli',
  },
};
