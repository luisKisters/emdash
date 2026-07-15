import { observer } from 'mobx-react-lite';
import type { PhaseStatus } from '@shared/core/loops/loops';
import { Button } from '@renderer/lib/ui/button';
import type { LoopsStore } from './loops-store';

const PHASE_LABEL: Record<PhaseStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  verifying: 'Verifying',
  passed: 'Passed',
  failed: 'Failed',
};

/**
 * Loop control panel: status header, the ordered phase list with per-phase
 * status + attempt count, and pause/resume/cancel/retry buttons wired to the
 * store. Renders nothing until the store has loaded a loop.
 */
export const LoopView = observer(function LoopView({ store }: { store: LoopsStore }) {
  const loop = store.loop;
  if (!loop) return null;

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="loop-view">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Loop</span>
        <span
          className="ml-auto text-xs text-muted-foreground"
          data-testid="loop-status"
        >
          {loop.status}
        </span>
      </div>

      <ol className="flex flex-col gap-1">
        {loop.phases.map((phase, index) => (
          <li
            key={phase.id}
            className="flex items-center gap-2 rounded-md border border-border-1 px-2 py-1 text-xs"
            data-testid="loop-phase"
          >
            <span className="text-muted-foreground">{index + 1}.</span>
            <span className="truncate">{phase.name}</span>
            <span className="ml-auto text-muted-foreground">
              {PHASE_LABEL[phase.status]}
              {phase.attempts > 0 ? ` · attempt ${phase.attempts}` : ''}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!store.canPause}
          onClick={() => store.pause()}
        >
          Pause
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!store.canResume}
          onClick={() => store.resume()}
        >
          Resume
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!store.canRetry}
          onClick={() => store.retry()}
        >
          Retry
        </Button>
        <Button size="sm" variant="ghost" onClick={() => store.cancel()}>
          Cancel
        </Button>
      </div>
    </div>
  );
});
