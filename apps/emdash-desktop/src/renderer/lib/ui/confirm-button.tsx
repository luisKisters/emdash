import type { Button as ButtonPrimitive } from '@base-ui/react/button';
import { useHotkey } from '@tanstack/react-hotkeys';
import type { VariantProps } from 'class-variance-authority';
import { useId, useRef } from 'react';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import {
  getEffectiveHotkey,
  getHotkeyRegistration,
} from '@renderer/lib/hooks/useKeyboardShortcuts';
import { Button, type buttonVariants } from './button';
import { BoundShortcut } from './shortcut';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

type ConfirmButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & { disabledReason?: string | null };

export function ConfirmButton({
  disabled,
  disabledReason,
  children,
  ...props
}: ConfirmButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const { value: keyboard } = useAppSettingsKey('keyboard');
  const confirmHotkey = getEffectiveHotkey('confirm', keyboard);

  useHotkey(getHotkeyRegistration('confirm', keyboard), () => ref.current?.click(), {
    enabled: !disabled && confirmHotkey !== null,
  });

  const button = (
    <Button
      ref={ref}
      disabled={disabled}
      aria-describedby={disabled && disabledReason ? reasonId : undefined}
      {...props}
    >
      <span className="flex items-center gap-2">
        {children}
        <BoundShortcut settingsKey="confirm" variant="keycaps" />
      </span>
    </Button>
  );

  if (!disabled || !disabledReason) return button;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-describedby={reasonId}
            className="focus-visible:ring-ring inline-flex rounded-md focus-visible:ring-2 focus-visible:outline-none"
          />
        }
      >
        {button}
      </TooltipTrigger>
      <TooltipContent id={reasonId}>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
