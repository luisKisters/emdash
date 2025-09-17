// Parse Codex CLI style output into reasoning + final response parts
// Heuristics based on timestamped markers like:
// [2025-09-17T22:13:26] thinking
// ...reasoning markdown...
// [2025-09-17T22:13:28] codex
// ...final message...

export interface ParsedCodexOutput {
  reasoning?: string
  response: string
}

const TS_LINE = /^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T[^\]]+\]/

export function parseCodexOutput(raw: string): ParsedCodexOutput {
  if (!raw) return { response: '' }

  const lines = raw.split(/\r?\n/)

  // Find last thinking/codex markers to support multiple blocks
  let thinkingIdx = -1
  let codexIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (TS_LINE.test(l)) {
      const tag = l.replace(TS_LINE, '').trim().toLowerCase()
      if (tag === 'thinking') thinkingIdx = i
      if (tag === 'codex') codexIdx = i
    }
  }

  // If we have both markers in order, slice accordingly
  if (thinkingIdx !== -1 && codexIdx !== -1 && codexIdx > thinkingIdx) {
    const reasoning = lines.slice(thinkingIdx + 1, codexIdx)
      // Drop empty leading/trailing noise
      .join('\n')
      .trim()
    // Final response: from codex line to next timestamp or end
    let end = lines.length
    for (let i = codexIdx + 1; i < lines.length; i++) {
      if (TS_LINE.test(lines[i])) { end = i; break }
    }
    const response = lines.slice(codexIdx + 1, end).join('\n').trim()
    if (response || reasoning) return { reasoning: reasoning || undefined, response }
  }

  // If we only have thinking (streaming reasoning before final appears)
  if (thinkingIdx !== -1 && codexIdx === -1) {
    const reasoning = lines.slice(thinkingIdx + 1).join('\n').trim()
    return { reasoning: reasoning || undefined, response: '' }
  }

  // Fallback: strip known header/footer noise and return remainder as response
  const cleaned = lines
    .filter((l) => {
      const t = l.trim()
      if (!t) return false
      if (t.startsWith('OpenAI Codex')) return false
      if (t === '--------') return false
      if (t.toLowerCase().startsWith('tokens used:')) return false
      if (TS_LINE.test(t) && /^(user instructions:)/i.test(t.replace(TS_LINE, '').trim())) return false
      return true
    })
    .join('\n')
    .trim()

  return { response: cleaned }
}
