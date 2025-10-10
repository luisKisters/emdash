// If providerId is supplied, scope the flag per provider; otherwise fall back to legacy key.
export const initialPromptSentKey = (workspaceId: string, providerId?: string) =>
  providerId && providerId.trim()
    ? `initialPromptSent:${workspaceId}:${providerId.trim()}`
    : `initialPromptSent:${workspaceId}`;
