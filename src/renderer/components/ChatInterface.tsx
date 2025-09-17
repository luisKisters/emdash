import React, { useState, useEffect, useRef } from "react";
import { Folder } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import ReactMarkdown from "react-markdown";
import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import useCodexStream from "../hooks/useCodexStream";
import { buildAttachmentsSection } from "../lib/attachments";
import { Workspace, Message } from "../types/chat";

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

interface Props {
  workspace: Workspace;
  projectName: string;
  className?: string;
}

const REFAC_ENABLED = true;

const ChatInterfaceImpl: React.FC<Props> = ({
  workspace,
  projectName,
  className,
}) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [legacyIsStreaming, setLegacyIsStreaming] = useState(false);
  const [legacySeconds, setLegacySeconds] = useState(0);
  const [isCodexInstalled, setIsCodexInstalled] = useState<boolean | null>(
    null
  );
  const [agentCreated, setAgentCreated] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [legacyStreamingOutput, setLegacyStreamingOutput] = useState("");
  const legacyStreamOutputRef = useRef("");
  const legacyCancelledStreamRef = useRef(false);
  const initializedConversationRef = useRef<string | null>(null);

  // Auto-scroll state
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

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

  // Auto-scroll when messages change or streaming updates (legacy path)
  useEffect(() => {
    if (REFAC_ENABLED) return;
    scrollToBottom();
  }, [messages, legacyStreamingOutput, shouldAutoScroll]);

  useEffect(() => {
    if (REFAC_ENABLED) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    if (legacyIsStreaming) {
      setLegacySeconds(0);
      interval = setInterval(() => {
        setLegacySeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setLegacySeconds(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [legacyIsStreaming]);

  // Legacy streaming event listeners
  useEffect(() => {
    if (REFAC_ENABLED) return;

    const unsubscribeOutput = (window.electronAPI as any).onCodexStreamOutput(
      (data: { workspaceId: string; output: string; agentId: string }) => {
        if (data.workspaceId !== workspace.id) return;

        legacyStreamOutputRef.current += data.output;
        setLegacyStreamingOutput(legacyStreamOutputRef.current);

        if (!legacyCancelledStreamRef.current) {
          setLegacyIsStreaming(true);
        }
      }
    );

    const unsubscribeError = (window.electronAPI as any).onCodexStreamError(
      (data: { workspaceId: string; error: string; agentId: string }) => {
        if (data.workspaceId === workspace.id) {
          console.error('Codex streaming error:', data.error);
          setLegacyIsStreaming(false);
          legacyStreamOutputRef.current = '';
          setLegacyStreamingOutput('');
          legacyCancelledStreamRef.current = false;
        }
      }
    );

    const unsubscribeComplete = (window.electronAPI as any).onCodexStreamComplete(
      (data: { workspaceId: string; exitCode: number; agentId: string }) => {
        if (data.workspaceId !== workspace.id) return;
        setLegacyIsStreaming(false);
        setLegacySeconds(0);

        if (legacyCancelledStreamRef.current) {
          legacyCancelledStreamRef.current = false;
          return;
        }

        const rawOutput = legacyStreamOutputRef.current;
        const trimmed = rawOutput.trim();

        if (trimmed) {
          const agentMessage: Message = {
            id: Date.now().toString(),
            content: trimmed,
            sender: 'agent',
            timestamp: new Date(),
          };

          window.electronAPI.saveMessage({
            id: agentMessage.id,
            conversationId,
            content: agentMessage.content,
            sender: agentMessage.sender,
            metadata: JSON.stringify({
              workspaceId: workspace.id,
              isStreaming: true,
            }),
          });

          setMessages((prev) => [...prev, agentMessage]);
        }

        legacyStreamOutputRef.current = '';
        setLegacyStreamingOutput('');
        legacyCancelledStreamRef.current = false;
      }
    );

    return () => {
      unsubscribeOutput();
      unsubscribeError();
      unsubscribeComplete();
      legacyStreamOutputRef.current = '';
      setLegacyStreamingOutput('');
      legacyCancelledStreamRef.current = false;
    };
  }, [workspace.id, conversationId]);

  useEffect(() => {
    if (REFAC_ENABLED) return;
    (async () => {
      try {
        const status = await (window as any).electronAPI.codexGetAgentStatus(workspace.id);
        if (status?.success && status.agent) {
          if (status.agent.status === 'running' && status.agent.lastResponse) {
            setLegacyIsStreaming(true);
            setLegacyStreamingOutput(status.agent.lastResponse);
          }
        }
      } catch {}
    })();
  }, [workspace.id]);

  // Load conversation and messages on mount
  useEffect(() => {
    if (REFAC_ENABLED) {
      return;
    }
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
                content: `Hello! You're working in workspace **${workspace.name}**. What can the agent do for you?`,
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

  const codexStream = useCodexStream(
    REFAC_ENABLED
      ? {
          workspaceId: workspace.id,
          workspacePath: workspace.path,
        }
      : null
  );

  useEffect(() => {
    if (!REFAC_ENABLED) return;
    setIsLoadingMessages(codexStream.isLoading);
  }, [codexStream.isLoading]);

  const activeStreamingOutput = REFAC_ENABLED
    ? codexStream.streamingOutput
    : legacyStreamingOutput;
  const activeIsStreaming = REFAC_ENABLED
    ? codexStream.isStreaming
    : legacyIsStreaming;
  const activeSeconds = REFAC_ENABLED ? codexStream.seconds : legacySeconds;

  useEffect(() => {
    if (!REFAC_ENABLED) return;
    initializedConversationRef.current = null;
  }, [workspace.id]);

  useEffect(() => {
    if (!REFAC_ENABLED) return;
    if (!codexStream.isReady) return;

    const convoId = codexStream.conversationId;
    if (!convoId) return;

    if (initializedConversationRef.current === convoId) {
      return;
    }

    initializedConversationRef.current = convoId;
    setConversationId(convoId);

    if (codexStream.messages.length === 0) {
      const welcomeMessage: Message = {
        id: `welcome-${Date.now()}`,
        content: `Hello! You're working in workspace **${workspace.name}**. What can the agent do for you?`,
        sender: "agent",
        timestamp: new Date(),
      };

      window.electronAPI
        .saveMessage({
          id: welcomeMessage.id,
          conversationId: convoId,
          content: welcomeMessage.content,
          sender: welcomeMessage.sender,
          metadata: JSON.stringify({ isWelcome: true }),
        })
        .catch((error: unknown) => {
          console.error("Failed to save welcome message:", error);
        })
        .finally(() => {
          codexStream.appendMessage(welcomeMessage);
        });
    }
  }, [
    codexStream.isReady,
    codexStream.conversationId,
    codexStream.messages.length,
    codexStream.appendMessage,
    workspace.name,
  ]);

  useEffect(() => {
    if (!REFAC_ENABLED) return;
    setMessages(codexStream.messages);
  }, [codexStream.messages]);

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
    if (!inputValue.trim()) return;

    if (REFAC_ENABLED) {
      if (!codexStream.conversationId) return;
    } else if (!conversationId) {
      return;
    }

    const attachmentsSection = await buildAttachmentsSection(
      workspace.path,
      inputValue,
      {
        maxFiles: 6,
        maxBytesPerFile: 200 * 1024,
      }
    );

    if (REFAC_ENABLED) {
      const result = await codexStream.send(inputValue, attachmentsSection);
      if (!result.success) {
        if (result.error && result.error !== "stream-in-progress") {
          toast({
            title: "Communication Error",
            description: "Failed to start Codex stream. Please try again.",
            variant: "destructive",
          });
        }
        return;
      }

      setInputValue("");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

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

    const messageToSend = inputValue + attachmentsSection;
    setInputValue("");
    legacyStreamOutputRef.current = "";
    setLegacyStreamingOutput("");
    setLegacyIsStreaming(true);
    legacyCancelledStreamRef.current = false;

    try {
      await (window.electronAPI as any).codexSendMessageStream(
        workspace.id,
        messageToSend
      );
    } catch (error) {
      console.error("Error starting Codex stream:", error);
      setLegacyIsStreaming(false);
      legacyStreamOutputRef.current = "";
      setLegacyStreamingOutput("");

      toast({
        title: "Communication Error",
        description: "Failed to start Codex stream. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelStream = async () => {
    if (!activeIsStreaming) return;

    if (REFAC_ENABLED) {
      const result = await codexStream.cancel();
      if (!result.success) {
        toast({
          title: "Cancel Failed",
          description: "Unable to stop Codex stream. Please try again.",
          variant: "destructive",
        });
      }
      return;
    }

    try {
      const result = await window.electronAPI.codexStopStream(workspace.id);
      if (!result?.success) {
        toast({
          title: "Cancel Failed",
          description: result?.error || "Unable to stop Codex stream.",
          variant: "destructive",
        });
        return;
      }
      legacyCancelledStreamRef.current = true;
    } catch (error) {
      console.error("Failed to stop Codex stream:", error);
      toast({
        title: "Cancel Failed",
        description: "Unable to stop Codex stream. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setLegacyIsStreaming(false);
    setLegacySeconds(0);
    setLegacyStreamingOutput(legacyStreamOutputRef.current);
  };

  const streamingOutputForList =
    activeIsStreaming || activeStreamingOutput
      ? activeStreamingOutput
      : null;

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

      {REFAC_ENABLED ? (
        isLoadingMessages ? (
          <div
            className="flex-1 overflow-y-auto px-6 pt-6 pb-2"
            style={{
              maskImage:
                'linear-gradient(to bottom, black 0%, black 93%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, black 0%, black 93%, transparent 100%)',
            }}
          >
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500 dark:text-gray-400 text-sm font-sans">
                  Loading conversation...
                </div>
              </div>
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            streamingOutput={streamingOutputForList}
          />
        )
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 pt-6 pb-2"
          style={{
            maskImage:
              'linear-gradient(to bottom, black 0%, black 93%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, black 93%, transparent 100%)',
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
                  const content = message.content ?? "";
                  const trimmedContent = content.trim();
                  if (!isUserMessage && !trimmedContent) return null;

                  return (
                    <div
                      key={message.id}
                      className={`flex ${
                        isUserMessage ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed font-sans text-gray-900 dark:text-gray-100 ${
                          isUserMessage
                            ? "rounded-md bg-gray-100 dark:bg-gray-700"
                            : ""
                        }`}
                      >
                        {isUserMessage ? (
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown
                              components={{
                                code: ({ inline, className, children, ...props }: any) => {
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
                                li: ({ children }) => <li className="ml-2">{children}</li>,
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
                              {content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm">
                            {trimmedContent}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}

                {(legacyIsStreaming || legacyStreamingOutput) && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] px-4 py-3 text-sm leading-relaxed font-sans text-gray-900 dark:text-gray-100">
                      <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm">
                        {legacyStreamingOutput ?? ""}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Scroll target element */}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendMessage}
        onCancel={handleCancelStream}
        isLoading={activeIsStreaming}
        loadingSeconds={activeSeconds}
        isCodexInstalled={isCodexInstalled}
        agentCreated={agentCreated}
        workspacePath={workspace.path}
      />
    </div>
  );

};

export const ChatInterface: React.FC<Props> = (props) => {
  return <ChatInterfaceImpl {...props} />;
};

export default ChatInterface;
