import React, { useState, useEffect } from "react";
import { Run } from "../types";

interface RightPanelProps {
  selectedRun: Run | null;
}

const RightPanel: React.FC<RightPanelProps> = ({ selectedRun }) => {
  const [activeTab, setActiveTab] = useState<"logs" | "diff" | "terminal">(
    "logs"
  );
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (selectedRun) {
      // Set up event listener for run events
      const handleRunEvent = (event: any) => {
        if (event.runId === selectedRun.id) {
          setLogs((prev) => [...prev, event]);
        }
      };

      window.electronAPI.onRunEvent(handleRunEvent);

      return () => {
        window.electronAPI.removeRunEventListeners();
      };
    }
  }, [selectedRun]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getEventIcon = (kind: string) => {
    switch (kind) {
      case "llm":
        return "🤖";
      case "tool":
        return "🔧";
      case "bash":
        return "💻";
      case "git":
        return "📝";
      case "diff":
        return "📊";
      case "error":
        return "❌";
      default:
        return "📄";
    }
  };

  if (!selectedRun) {
    return (
      <div className="w-96 bg-gray-800 border-l border-gray-700 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">📋</div>
          <p>Select a run to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-white">Run Details</h3>
          <div className="flex gap-1">
            <button
              className={`px-2 py-1 text-xs rounded ${
                activeTab === "logs"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
              onClick={() => setActiveTab("logs")}
            >
              Logs
            </button>
            <button
              className={`px-2 py-1 text-xs rounded ${
                activeTab === "diff"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
              onClick={() => setActiveTab("diff")}
            >
              Diff
            </button>
            <button
              className={`px-2 py-1 text-xs rounded ${
                activeTab === "terminal"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
              onClick={() => setActiveTab("terminal")}
            >
              Terminal
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-400">
          <div>Branch: {selectedRun.branch}</div>
          <div>Provider: {selectedRun.provider}</div>
          <div>Status: {selectedRun.status}</div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "logs" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="space-y-3">
              {logs.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-2xl mb-2">📝</div>
                  <p>No logs yet</p>
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="bg-gray-700 p-3 rounded">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getEventIcon(log.kind)}</span>
                      <span className="text-sm font-medium text-gray-300">
                        {log.kind.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {typeof log.payload === "string"
                        ? log.payload
                        : JSON.stringify(log.payload, null, 2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "diff" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="text-center text-gray-500 py-8">
              <div className="text-2xl mb-2">📊</div>
              <p>Diff view coming soon</p>
            </div>
          </div>
        )}

        {activeTab === "terminal" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="text-center text-gray-500 py-8">
              <div className="text-2xl mb-2">💻</div>
              <p>Terminal view coming soon</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <button className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm">
            Create PR
          </button>
          {selectedRun.status === "running" && (
            <button className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RightPanel;
