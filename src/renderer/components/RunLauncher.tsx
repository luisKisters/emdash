import React, { useState } from 'react';
import { Repo } from '../types';
import { useToast } from '../hooks/use-toast';

interface RunLauncherProps {
  repo: Repo;
  onCreateRun: (config: any) => void;
  onCancel: () => void;
}

const RunLauncher: React.FC<RunLauncherProps> = ({ repo, onCreateRun, onCancel }) => {
  const { toast } = useToast();
  const [provider, setProvider] = useState<'claude-code' | 'openai-agents'>('claude-code');
  const [prompt, setPrompt] = useState('');
  const [numAgents, setNumAgents] = useState(1);
  const [baseBranch, setBaseBranch] = useState(repo.defaultBranch);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a prompt',
        variant: 'destructive',
      });
      return;
    }

    onCreateRun({
      provider,
      prompt: prompt.trim(),
      numAgents,
      baseBranch,
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 w-full max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">Start New Run</h3>
        <button className="text-gray-400 hover:text-white text-xl" onClick={onCancel}>
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">AI Provider</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="claude-code"
                checked={provider === 'claude-code'}
                onChange={(e) => setProvider(e.target.value as 'claude-code')}
                className="mr-2"
              />
              <span className="text-white">Claude Code</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="openai-agents"
                checked={provider === 'openai-agents'}
                onChange={(e) => setProvider(e.target.value as 'openai-agents')}
                className="mr-2"
              />
              <span className="text-white">OpenAI Agents</span>
            </label>
          </div>
        </div>

        {/* Prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want the coding agents to do..."
            className="w-full h-32 p-3 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        {/* Number of Agents */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Number of Agents</label>
          <select
            value={numAgents}
            onChange={(e) => setNumAgents(parseInt(e.target.value))}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          >
            <option value={1}>1 Agent</option>
            <option value={2}>2 Agents</option>
            <option value={3}>3 Agents</option>
            <option value={4}>4 Agents</option>
            <option value={5}>5 Agents</option>
          </select>
        </div>

        {/* Base Branch */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Base Branch</label>
          <input
            type="text"
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            placeholder="main"
          />
        </div>

        {/* Repository Info */}
        <div className="bg-gray-700 p-3 rounded">
          <div className="text-sm text-gray-300">
            <strong>Repository:</strong> {repo.path.split('/').pop()}
          </div>
          <div className="text-sm text-gray-400">
            <strong>Origin:</strong> {repo.origin}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
          >
            Start Run
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default RunLauncher;
