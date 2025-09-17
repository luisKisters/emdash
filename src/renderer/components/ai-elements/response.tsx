import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type ResponseProps = ComponentProps<"div">;

export const Response = ({ className, ...props }: ResponseProps) => (
  <div
    className={cn(
      "[&>p]:leading-normal [&>p]:my-0",
      "[&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-800",
      className
    )}
    {...props}
  />
);

