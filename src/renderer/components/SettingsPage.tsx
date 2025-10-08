import React from 'react';
import { Button } from './ui/button';

interface SettingsPageProps {
  onClose: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onClose }) => {
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hover:bg-background/80"
          onClick={onClose}
        >
          Close
        </Button>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Settings configuration coming soon.</p>
      </div>
    </div>
  );
};

export default SettingsPage;
