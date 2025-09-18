import React from "react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { GitBranch, Plus, Loader2 } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "./ui/breadcrumb";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

interface Project {
  id: string;
  name: string;
  path: string;
  gitInfo: {
    isGitRepo: boolean;
    remote?: string;
    branch?: string;
  };
  githubInfo?: {
    repository: string;
    connected: boolean;
  };
  workspaces?: Workspace[];
}

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: "active" | "idle" | "running";
  agentId?: string;
}

function StatusBadge({ status }: { status: Workspace["status"] }) {
  return (
    <Badge variant="secondary" className="capitalize">
      {status}
    </Badge>
  );
}

function WorkspaceCard({
  ws,
  active,
  onClick,
}: {
  ws: Workspace;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={[
        "cursor-pointer transition-shadow hover:shadow-sm",
        active ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <CardHeader className="space-y-1 p-4 pb-2">
        <CardTitle className="text-base leading-tight tracking-tight">
          {ws.name}
        </CardTitle>
        <CardDescription className="flex items-center gap-2 min-w-0 text-xs">
          {ws.status === "running" && (
            <Loader2 className="size-3 animate-spin" />
          )}
          <GitBranch className="size-3" />
          <span
            className="text-xs truncate max-w-[12rem]"
            title={`origin/${ws.branch}`}
          >
            origin/{ws.branch}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex items-center justify-between">
        <StatusBadge status={ws.status} />
        {ws.agentId && <Badge variant="outline">agent</Badge>}
      </CardContent>
    </Card>
  );
}

interface ProjectMainViewProps {
  project: Project;
  onCreateWorkspace: () => void;
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  isCreatingWorkspace?: boolean;
}

const ProjectMainView: React.FC<ProjectMainViewProps> = ({
  project,
  onCreateWorkspace,
  activeWorkspace,
  onSelectWorkspace,
  isCreatingWorkspace = false,
}) => {
  return (
    <div className="flex-1 bg-background">
      <div className="container mx-auto max-w-6xl p-6 space-y-8">
        <div className="mb-8 space-y-2">
          <header className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>

              <Breadcrumb className="text-muted-foreground">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink className="text-muted-foreground">
                      {project.path}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {project.gitInfo.branch && (
                    <BreadcrumbItem>
                      <Badge variant="secondary" className="gap-1">
                        <GitBranch className="size-3" />
                        origin/{project.gitInfo.branch}
                      </Badge>
                    </BreadcrumbItem>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>

          </header>
          <Separator className="my-2" />
        </div>

        <div className="max-w-4xl space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-start gap-3">
              <h2 className="text-lg font-semibold">Workspaces</h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={onCreateWorkspace}
                disabled={isCreatingWorkspace}
                aria-busy={isCreatingWorkspace}
              >
                {isCreatingWorkspace ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 size-4" />
                    Create workspace
                  </>
                )}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(project.workspaces ?? []).map((ws) => (
                <WorkspaceCard
                  key={ws.id}
                  ws={ws}
                  active={activeWorkspace?.id === ws.id}
                  onClick={() => onSelectWorkspace(ws)}
                />
              ))}
            </div>
          </div>

          {(!project.workspaces || project.workspaces.length === 0) && (
            <Alert>
              <AlertTitle>What’s a workspace?</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Each workspace is an isolated copy and branch of your repo (Git-tracked files only).
                </p>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectMainView;
