import React from "react";
import { cn } from "../../lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-32 max-h-40 w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 leading-6 text-neutral-950 shadow-sm outline-none placeholder:text-neutral-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100",
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";
