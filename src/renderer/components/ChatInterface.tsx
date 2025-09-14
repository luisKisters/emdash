import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Send, Bot, User, Folder } from "lucide-react";
import openaiLogo from "../../assets/images/openai.png";

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: "active" | "idle" | "running";
}

interface Message {
  id: string;
  content: string;
  sender: "user" | "agent";
  timestamp: Date;
}

interface Props {
  workspace: Workspace;
  projectName: string;
  className?: string;
}

export const ChatInterface: React.FC<Props> = ({
  workspace,
  projectName,
  className,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: `Hello! I'm Codex and I'm ready to help you work on ${workspace.name}. What would you like me to do?`,
      sender: "agent",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Simulate agent response (replace with actual agent call)
    setTimeout(() => {
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I understand you want me to: "${inputValue}". I'll work on that in the ${workspace.branch} branch.`,
        sender: "agent",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}
    >
      <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center space-x-3">
          <Folder className="w-5 h-5 text-gray-600" />
          <div>
            <h3 className="font-serif font-medium text-gray-900 dark:text-gray-100">
              {projectName}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message) => (
            <div key={message.id} className="text-gray-900 dark:text-gray-100">
              <p className="text-base leading-relaxed font-serif">
                {message.content}
              </p>
            </div>
          ))}

          {isLoading && (
            <div className="text-gray-600 dark:text-gray-400">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg">
            <div className="p-4">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask Codex anything..."
                className="w-full resize-none border-none outline-none bg-transparent text-gray-900 dark:text-gray-100 font-serif text-base placeholder-gray-500 dark:placeholder-gray-400"
                rows={1}
                disabled={isLoading}
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
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                className="w-8 h-8 p-0 bg-gray-600 hover:bg-gray-700 text-white rounded-full disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
