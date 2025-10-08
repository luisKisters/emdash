import React from 'react';
import { type Provider } from '../types';
import openaiLogo from '../../assets/images/openai.png';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import claudeLogo from '../../assets/images/claude.png';
import factoryLogo from '../../assets/images/factorydroid.png';
import geminiLogo from '../../assets/images/gemini.png';
import cursorLogo from '../../assets/images/cursorlogo.png';
import copilotLogo from '../../assets/images/ghcopilot.png';

type Props = { provider: Provider };

export const ProviderBar: React.FC<Props> = ({ provider }) => {
  const map = {
    codex: { name: 'Codex', logo: openaiLogo },
    claude: { name: 'Claude Code', logo: claudeLogo },
    droid: { name: 'Droid', logo: factoryLogo },
    gemini: { name: 'Gemini', logo: geminiLogo },
    cursor: { name: 'Cursor', logo: cursorLogo },
    copilot: { name: 'Copilot', logo: copilotLogo },
  } as const;
  const cfg = map[provider] ?? { name: provider, logo: '' };
  return (
    <div className="px-6 pt-4 pb-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 rounded-md">
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 min-w-0 cursor-default select-none">
                    {cfg.logo ? (
                      <img
                        src={cfg.logo}
                        alt={cfg.name}
                        title={cfg.name}
                        className="w-5 h-5 object-contain align-middle flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-5 h-5 rounded-[4px] bg-gray-300 dark:bg-gray-600 text-[10px] text-gray-700 dark:text-gray-200 flex items-center justify-center flex-shrink-0"
                        aria-hidden
                      >
                        {cfg.name.slice(0, 1)}
                      </div>
                    )}
                    <div className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate">
                      {cfg.name}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Provider is locked for this conversation.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderBar;
