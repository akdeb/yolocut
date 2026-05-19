"use client";

/* eslint-disable @remotion/non-pure-animation */

import { ArrowUp, Loader2 } from "lucide-react";

type PromptBarProps = {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  autoFocus?: boolean;
  className?: string;
  textareaClassName?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export const PromptBar = ({
  value,
  placeholder = "Lets make a viral hit...",
  disabled = false,
  isSubmitting = false,
  autoFocus = false,
  className = "",
  textareaClassName = "",
  onChange,
  onSubmit,
}: PromptBarProps) => {
  return (
    <div
      className={`flex w-full items-end gap-3 rounded-[2rem] border border-neutral-200 bg-white p-3 shadow-sm focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100 ${className}`}
    >
      <textarea
        className={`max-h-28 min-h-12 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-base leading-6 text-neutral-950 outline-none placeholder:text-neutral-400 ${textareaClassName}`}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <button
        className="mb-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-35"
        type="button"
        disabled={disabled || isSubmitting}
        onClick={onSubmit}
        aria-label="Create"
      >
        {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
      </button>
    </div>
  );
};
