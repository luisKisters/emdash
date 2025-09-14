import React from "react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Send } from "lucide-react";
import openaiLogo from "../../assets/images/openai.png";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  isCodexInstalled: boolean | null;
  agentCreated: boolean;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  isLoading,
  isCodexInstalled,
  agentCreated,
  disabled = false,
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const getPlaceholder = () => {
    if (!isCodexInstalled) {
      return "Codex CLI not installed...";
    }
    if (!agentCreated) {
      return "Initializing Codex...";
    }
    return "Ask Codex anything...";
  };

  const isDisabled = disabled || isLoading || !isCodexInstalled || !agentCreated;

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg">
          <div className="p-4">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={getPlaceholder()}
              className="w-full resize-none border-none outline-none bg-transparent text-gray-900 dark:text-gray-100 font-serif text-base placeholder-gray-500 dark:placeholder-gray-400"
              rows={1}
              disabled={isDisabled}
              style={{ minHeight: '24px' }}
            />
          </div>
          
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
            <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
              <img 
                src={openaiLogo} 
                alt="OpenAI" 
                className="w-4 h-4"
              />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 font-serif">
                OpenAI Codex CLI
              </span>
            </div>
            
            <Button
              onClick={onSend}
              disabled={!value.trim() || isDisabled}
              className="w-8 h-8 p-0 bg-gray-600 hover:bg-gray-700 text-white rounded-full disabled:opacity-50"
            >
              {isLoading ? (
                <Spinner size="sm" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
