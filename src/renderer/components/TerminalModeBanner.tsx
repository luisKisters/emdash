import React from 'react';
import { providerMeta, type UiProvider } from '../providers/meta';

type Props = {
  provider: UiProvider;
  onOpenExternal: (url: string) => void;
};

export const TerminalModeBanner: React.FC<Props> = ({ provider, onOpenExternal }) => {
  const meta = providerMeta[provider];
  const helpUrl = meta?.helpUrl;

  const text =
    provider === 'droid'
      ? 'Interact with Droid in the terminal below. To install and get started, see the Factory CLI Quickstart:'
      : provider === 'gemini'
        ? 'Interact with Gemini in the terminal below. To install and get started, visit the Gemini CLI project:'
        : provider === 'cursor'
          ? 'Interact with Cursor in the terminal below. To install and get started, follow the Cursor CLI docs:'
          : 'Interact with Copilot in the terminal below. To install and get started, follow the GitHub Copilot CLI docs:';

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 p-3 text-sm">
      <div className="whitespace-pre-wrap">{text}</div>
      {helpUrl ? (
        <button
          type="button"
          onClick={() => onOpenExternal(helpUrl)}
          className="mt-1 underline text-gray-800 hover:text-gray-600 dark:text-gray-200 dark:hover:text-gray-100"
        >
          Docs
        </button>
      ) : null}
      <div className="mt-2 text-xs opacity-90">
        Note: The terminal session now persists while the app is open; leaving and returning to this
        chat will restore its output. Closing the app will terminate the session.
      </div>
    </div>
  );
};

export default TerminalModeBanner;
