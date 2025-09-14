import React, { useState, useEffect } from "react";
import { Folder } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import ReactMarkdown from "react-markdown";
import ChatInput from "./ChatInput";

// Type assertion for electronAPI
declare const window: Window & {
  electronAPI: {
    codexCheckInstallation: () => Promise<{
      success: boolean;
      isInstalled?: boolean;
      error?: string;
    }>;
    codexCreateAgent: (
      workspaceId: string,
      worktreePath: string
    ) => Promise<{ success: boolean; agent?: any; error?: string }>;
    codexSendMessage: (
      workspaceId: string,
      message: string
    ) => Promise<{ success: boolean; response?: any; error?: string }>;
    getOrCreateDefaultConversation: (
      workspaceId: string
    ) => Promise<{ success: boolean; conversation?: any; error?: string }>;
    getMessages: (
      conversationId: string
    ) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
    saveMessage: (
      message: any
    ) => Promise<{ success: boolean; error?: string }>;
  };
};

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
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCodexInstalled, setIsCodexInstalled] = useState<boolean | null>(
    null
  );
  const [agentCreated, setAgentCreated] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  // Load conversation and messages on mount
  useEffect(() => {
    const loadConversation = async () => {
      try {
        setIsLoadingMessages(true);

        // Get or create default conversation for this workspace
        const conversationResult =
          await window.electronAPI.getOrCreateDefaultConversation(workspace.id);
        if (conversationResult.success && conversationResult.conversation) {
          setConversationId(conversationResult.conversation.id);

          // Load messages for this conversation
          const messagesResult = await window.electronAPI.getMessages(
            conversationResult.conversation.id
          );
          if (messagesResult.success && messagesResult.messages) {
            const loadedMessages = messagesResult.messages.map((msg) => ({
              id: msg.id,
              content: msg.content,
              sender: msg.sender as "user" | "agent",
              timestamp: new Date(msg.timestamp),
            }));

            // If no messages exist, add welcome message
            if (loadedMessages.length === 0) {
              const welcomeMessage: Message = {
                id: `welcome-${Date.now()}`,
                content: `Hello! I'm Codex and I'm ready to help you work on ${workspace.name}. What would you like me to do?`,
                sender: "agent",
                timestamp: new Date(),
              };

              // Save welcome message to database
              await window.electronAPI.saveMessage({
                id: welcomeMessage.id,
                conversationId: conversationResult.conversation.id,
                content: welcomeMessage.content,
                sender: welcomeMessage.sender,
                metadata: JSON.stringify({ isWelcome: true }),
              });

              setMessages([welcomeMessage]);
            } else {
              setMessages(loadedMessages);
            }
          }
        } else {
          console.error(
            "Failed to load conversation:",
            conversationResult.error
          );
        }
      } catch (error) {
        console.error("Error loading conversation:", error);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadConversation();
  }, [workspace.id, workspace.name]);

  // Check Codex installation and create agent on mount
  useEffect(() => {
    const initializeCodex = async () => {
      try {
        // Check if Codex is installed
        const installResult = await window.electronAPI.codexCheckInstallation();
        if (installResult.success) {
          setIsCodexInstalled(installResult.isInstalled ?? false);

          if (installResult.isInstalled) {
            // Create agent for this workspace
            const agentResult = await window.electronAPI.codexCreateAgent(
              workspace.id,
              workspace.path
            );
            if (agentResult.success) {
              setAgentCreated(true);
              console.log("Codex agent created for workspace:", workspace.name);
            } else {
              console.error("Failed to create Codex agent:", agentResult.error);
              toast({
                title: "Error",
                description: "Failed to create Codex agent. Please try again.",
                variant: "destructive",
              });
            }
          }
        } else {
          console.error(
            "Failed to check Codex installation:",
            installResult.error
          );
        }
      } catch (error) {
        console.error("Error initializing Codex:", error);
      }
    };

    initializeCodex();
  }, [workspace.id, workspace.path, workspace.name, toast]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !conversationId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    // Save user message to database
    try {
      await window.electronAPI.saveMessage({
        id: userMessage.id,
        conversationId: conversationId,
        content: userMessage.content,
        sender: userMessage.sender,
        metadata: JSON.stringify({ workspaceId: workspace.id }),
      });
    } catch (error) {
      console.error("Failed to save user message:", error);
    }

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await window.electronAPI.codexSendMessage(
        workspace.id,
        inputValue
      );

      if (response.success && response.response) {
        const agentMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response.response.output || "Codex completed the task.",
          sender: "agent",
          timestamp: new Date(),
        };

        // Save agent message to database
        try {
          await window.electronAPI.saveMessage({
            id: agentMessage.id,
            conversationId: conversationId,
            content: agentMessage.content,
            sender: agentMessage.sender,
            metadata: JSON.stringify({
              workspaceId: workspace.id,
              agentId: response.response.agentId,
              isCodexResponse: true,
            }),
          });
        } catch (error) {
          console.error("Failed to save agent message:", error);
        }

        setMessages((prev) => [...prev, agentMessage]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: `Error: ${response.error || "Unknown error occurred"}`,
          sender: "agent",
          timestamp: new Date(),
        };

        // Save error message to database
        try {
          await window.electronAPI.saveMessage({
            id: errorMessage.id,
            conversationId: conversationId,
            content: errorMessage.content,
            sender: errorMessage.sender,
            metadata: JSON.stringify({
              workspaceId: workspace.id,
              isError: true,
              errorType: "codex_error",
            }),
          });
        } catch (error) {
          console.error("Failed to save error message:", error);
        }

        setMessages((prev) => [...prev, errorMessage]);

        toast({
          title: "Codex Error",
          description: response.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error sending message to Codex:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Failed to communicate with Codex. Please try again.",
        sender: "agent",
        timestamp: new Date(),
      };

      // Save communication error message to database
      try {
        await window.electronAPI.saveMessage({
          id: errorMessage.id,
          conversationId: conversationId,
          content: errorMessage.content,
          sender: errorMessage.sender,
          metadata: JSON.stringify({
            workspaceId: workspace.id,
            isError: true,
            errorType: "communication_error",
          }),
        });
      } catch (dbError) {
        console.error("Failed to save communication error message:", dbError);
      }

      setMessages((prev) => [...prev, errorMessage]);

      toast({
        title: "Communication Error",
        description: "Failed to communicate with Codex. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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

      <div className="flex-1 overflow-y-auto p-6" style={{ 
        maskImage: 'linear-gradient(to bottom, black 0%, black 85%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 85%, transparent 100%)'
      }}>
        <div className="max-w-4xl mx-auto space-y-6">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500 dark:text-gray-400 font-serif">
                Loading conversation...
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className="text-gray-900 dark:text-gray-100"
              >
                <div className="text-base leading-relaxed font-serif prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      code: ({
                        node,
                        inline,
                        className,
                        children,
                        ...props
                      }: any) => {
                        const match = /language-(\w+)/.exec(className || "");
                        return !inline && match ? (
                          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md overflow-x-auto">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        ) : (
                          <code
                            className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 my-2">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-1 my-2">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="ml-2">{children}</li>
                      ),
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold">{children}</strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))
          )}

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

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendMessage}
        isLoading={isLoading}
        isCodexInstalled={isCodexInstalled}
        agentCreated={agentCreated}
      />
    </div>
  );
};

export default ChatInterface;
