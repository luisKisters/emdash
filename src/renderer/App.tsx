import React, { useState, useEffect } from "react";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import { FolderOpen, Github, Globe } from "lucide-react";

const App: React.FC = () => {
  const [version, setVersion] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");

  useEffect(() => {
    // Load app info from Electron
    const loadAppInfo = async () => {
      try {
        const [appVersion, appPlatform] = await Promise.all([
          window.electronAPI.getVersion(),
          window.electronAPI.getPlatform(),
        ]);
        setVersion(appVersion);
        setPlatform(appPlatform);
      } catch (error) {
        console.error("Failed to load app info:", error);
      }
    };

    loadAppInfo();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-6xl  mb-4 font-serif tracking-wider">
            orchbench
          </h1>
          <p className="text-lg font-serif text-gray-700 text-muted-foreground">
            Run multiple Codex Agents in parallel
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Button size="lg" className="min-w-[200px] font-serif">
            <FolderOpen className="mr-2 h-5 w-5" />
            Open Project
          </Button>
          <Button variant="outline" size="lg" className="min-w-[200px] font-serif">
            <Github className="mr-2 h-5 w-5" />
            Clone from GitHub
          </Button>
          <Button variant="secondary" size="lg" className="min-w-[200px] font-serif">
            <Globe className="mr-2 h-5 w-5" />
            Clone from URL
          </Button>
        </div>
      </div>
    </div>
  );
};

export default App;
