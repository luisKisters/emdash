import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Folder } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import ReactMarkdown from "react-markdown";
import ChatInput from "./ChatInput";
import { buildAttachmentsSection } from "../lib/attachments";

const LIST_HEADING_KEYWORDS = ["tasks", "task", "todo", "to do", "steps", "plan", "plans"];

const filterCodexOutput = (markdown: string): string => {
  if (!markdown) return "";

  const lines = markdown.split(/\r?\n/);
  let collectingList = false;
  let latestSection: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (collectingList && latestSection.length > 0) {
        latestSection.push("");
      }
      continue;
    }

    const boldMatch = trimmed.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      latestSection = [boldMatch[0]];

      const heading = boldMatch[1].toLowerCase().trim();
      collectingList = LIST_HEADING_KEYWORDS.some((keyword) => heading === keyword);
      continue;
    }

    if (
      collectingList &&
      (trimmed.startsWith("- ") || /^(\d+\.|[a-z]\))/i.test(trimmed))
    ) {
      latestSection.push(line);
      continue;
    }

    if (collectingList) {
      collectingList = false;
    }
  }

  return latestSection.join("\n").trim();
};

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
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [isCodexInstalled, setIsCodexInstalled] = useState<boolean | null>(
    null
  );
  const [agentCreated, setAgentCreated] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [activeStreamingHeadline, setActiveStreamingHeadline] = useState<string | null>(
    null
  );
  const [isStreamingHeadlineVisible, setIsStreamingHeadlineVisible] = useState(false);
  
  // Auto-scroll state
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const streamLogPath = useMemo(
    () => `${workspace.path}/codex-stream.log`,
    [workspace.path]
  );

  const filteredStreamingMessage = useMemo(
    () => filterCodexOutput(streamingMessage),
    [streamingMessage]
  );

  const resetStreamLog = useCallback(
    async (content: string) => {
      try {
        const result = await window.electronAPI.debugAppendLog(
          streamLogPath,
          content,
          { reset: true }
        );
        if (!result.success) {
          console.error("Failed to reset Codex stream log:", result.error);
        }
      } catch (error) {
        console.error("Failed to reset Codex stream log:", error);
      }
    },
    [streamLogPath]
  );

  const appendToStreamLog = useCallback(
    (content: string) => {
      window.electronAPI
        .debugAppendLog(streamLogPath, content, { reset: false })
        .then((result) => {
          if (!result.success) {
            console.error("Failed to append to Codex stream log:", result.error);
          }
        })
        .catch((error) => {
          console.error("Failed to append to Codex stream log:", error);
        });
    },
    [streamLogPath]
  );

  // Auto-scroll to bottom function
  const scrollToBottom = () => {
    if (messagesEndRef.current && shouldAutoScroll) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Check if user is near bottom of scroll area
  const isNearBottom = () => {
    if (!scrollContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const threshold = 100; // pixels from bottom
    return scrollHeight - scrollTop - clientHeight < threshold;
  };

  // Handle scroll events
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    const nearBottom = isNearBottom();
    setShouldAutoScroll(nearBottom);
    
    // If user scrolls up significantly, disable auto-scroll
    if (!nearBottom) {
      setIsUserScrolling(true);
    } else {
      setIsUserScrolling(false);
    }
  };

  // Set up scroll event listener
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
      };
    }
  }, []);

  // Auto-scroll when messages change or streaming updates
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, shouldAutoScroll]);

  useEffect(() => {
    let frame: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    if (isStreaming && filteredStreamingMessage) {
      if (!activeStreamingHeadline) {
        setActiveStreamingHeadline(filteredStreamingMessage);
        frame = requestAnimationFrame(() => {
          setIsStreamingHeadlineVisible(true);
        });
      } else if (filteredStreamingMessage !== activeStreamingHeadline) {
        frame = requestAnimationFrame(() => {
          setIsStreamingHeadlineVisible(false);
        });
        timeout = setTimeout(() => {
          setActiveStreamingHeadline(filteredStreamingMessage);
          setIsStreamingHeadlineVisible(true);
        }, 260);
      } else {
        frame = requestAnimationFrame(() => {
          setIsStreamingHeadlineVisible(true);
        });
      }
    } else if (activeStreamingHeadline) {
      frame = requestAnimationFrame(() => {
        setIsStreamingHeadlineVisible(false);
      });
      timeout = setTimeout(() => {
        setActiveStreamingHeadline(null);
      }, 260);
    } else {
      setIsStreamingHeadlineVisible(false);
    }

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isStreaming, filteredStreamingMessage, activeStreamingHeadline]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isStreaming) {
      setLoadingSeconds(0);
      interval = setInterval(() => {
        setLoadingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setLoadingSeconds(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isStreaming]);

  // Set up streaming event listeners
  useEffect(() => {
    const unsubscribeOutput = (window.electronAPI as any).onCodexStreamOutput((data: { workspaceId: string; output: string; agentId: string }) => {
      if (data.workspaceId === workspace.id) {
        setStreamingMessage(prev => prev + data.output);
        appendToStreamLog(data.output);
      }
    });

    const unsubscribeError = (window.electronAPI as any).onCodexStreamError((data: { workspaceId: string; error: string; agentId: string }) => {
      if (data.workspaceId === workspace.id) {
        console.error('Codex streaming error:', data.error);
        setIsStreaming(false);
        setStreamingMessage("");
        appendToStreamLog(`\n[ERROR] ${data.error}\n`);
      }
    });

    const unsubscribeComplete = (window.electronAPI as any).onCodexStreamComplete((data: { workspaceId: string; exitCode: number; agentId: string }) => {
      if (data.workspaceId === workspace.id) {
        setIsStreaming(false);
        appendToStreamLog(`\n[COMPLETE] exit code ${data.exitCode}\n`);
        
        // Save the complete streaming message
        if (streamingMessage.trim()) {
          const agentMessage: Message = {
            id: Date.now().toString(),
            content: streamingMessage,
            sender: "agent",
            timestamp: new Date(),
          };

          // Save to database
          window.electronAPI.saveMessage({
            id: agentMessage.id,
            conversationId: conversationId,
            content: agentMessage.content,
            sender: agentMessage.sender,
            metadata: JSON.stringify({
              workspaceId: workspace.id,
              isStreaming: true,
            }),
          });

          setMessages((prev) => [...prev, agentMessage]);
        }
        
        setStreamingMessage("");
      }
    });

    return () => {
      unsubscribeOutput();
      unsubscribeError();
      unsubscribeComplete();
    };
  }, [workspace.id, conversationId, streamingMessage, appendToStreamLog]);

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

    const attachmentsSection = await buildAttachmentsSection(
      workspace.path,
      inputValue,
      {
        maxFiles: 6,
        maxBytesPerFile: 200 * 1024,
      }
    );

    const messageToSend = inputValue + attachmentsSection;
    setInputValue("");
    setIsStreaming(true);
    setStreamingMessage("");

    await resetStreamLog(
      [
        `=== Codex Stream ${new Date().toISOString()} ===`,
        `Workspace: ${workspace.name} (${workspace.id})`,
        "Prompt:",
        messageToSend,
        "",
        "--- Output ---",
        "",
      ].join("\n")
    );

    try {
      await (window.electronAPI as any).codexSendMessageStream(workspace.id, messageToSend);

    } catch (error) {
      console.error("Error starting Codex stream:", error);
      setIsStreaming(false);
      setStreamingMessage("");
      appendToStreamLog(`\n[STREAM_ERROR] ${error instanceof Error ? error.message : String(error)}\n`);
      
      toast({
        title: "Communication Error",
        description: "Failed to start Codex stream. Please try again.",
        variant: "destructive",
      });
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
            <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm font-sans">
              {projectName}
            </h3>
          </div>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-6" 
        style={{ 
          maskImage: 'linear-gradient(to bottom, black 0%, black 85%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 85%, transparent 100%)'
        }}
      >
        <div className="max-w-4xl mx-auto space-y-6">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500 dark:text-gray-400 text-sm font-sans">
                Loading conversation...
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => {
                const isUserMessage = message.sender === "user";
                const messageContent = isUserMessage
                  ? message.content
                  : filterCodexOutput(message.content);

                if (!isUserMessage && !messageContent) {
                  return null;
                }

                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      isUserMessage ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-md px-4 py-3 text-sm leading-relaxed font-sans ${
                        isUserMessage
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      <div className="prose prose-sm max-w-none">
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
                          {messageContent}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {activeStreamingHeadline && (
                <div
                  className={`flex justify-start transition-all duration-300 ease-out ${
                    isStreamingHeadlineVisible
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 -translate-y-1"
                  }`}
                >
                  <div
                    key={activeStreamingHeadline}
                    className="max-w-[80%] rounded-md px-4 py-3 text-sm leading-relaxed font-sans bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all duration-300 ease-out"
                  >
                    <div className="prose prose-sm max-w-none">
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
                            const language = match ? match[1] : "";
                            const codeContent = String(children).replace(/\n$/, "");

                            if (
                              language === "diff" ||
                              codeContent.includes("diff --git")
                            ) {
                              return (
                                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                                  <code className="text-gray-100" {...props}>
                                    {codeContent.split("\n").map((line, index) => {
                                      let lineClass = "text-gray-300";
                                      if (line.startsWith("+"))
                                        lineClass = "text-green-400";
                                      else if (line.startsWith("-"))
                                        lineClass = "text-red-400";
                                      else if (line.startsWith("@@"))
                                        lineClass = "text-blue-400";
                                      else if (line.startsWith("diff --git"))
                                        lineClass = "text-yellow-400";
                                      else if (line.startsWith("index"))
                                        lineClass = "text-purple-400";

                                      return (
                                        <div key={index} className={lineClass}>
                                          {line}
                                        </div>
                                      );
                                    })}
                                  </code>
                                </pre>
                              );
                            }

                            if (
                              !inline &&
                              (match ||
                                codeContent.includes("import ") ||
                                codeContent.includes("function ") ||
                                codeContent.includes("const ") ||
                                codeContent.includes("class "))
                            ) {
                              return (
                                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                                  <code className="text-gray-100" {...props}>
                                    {codeContent}
                                  </code>
                                </pre>
                              );
                            }

                            return (
                              <code
                                className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm font-mono text-gray-800 dark:text-gray-200"
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
                            <strong className="font-semibold text-gray-900 dark:text-gray-100">
                              {children}
                            </strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic">{children}</em>
                          ),
                        }}
                      >
                        {activeStreamingHeadline}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {isStreaming && !filteredStreamingMessage && (
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
          
          {/* Scroll target element */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendMessage}
        isLoading={isStreaming}
        loadingSeconds={loadingSeconds}
        isCodexInstalled={isCodexInstalled}
        agentCreated={agentCreated}
        workspacePath={workspace.path}
      />
    </div>
  );
};

export default ChatInterface;
