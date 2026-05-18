import React from "react";
import { cn } from "../../lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "text";
};

const variants = {
  default:
    "border-transparent bg-neutral-950 text-white shadow-sm hover:bg-neutral-800 disabled:hover:bg-neutral-950",
  outline:
    "border-neutral-200 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:hover:bg-white",
  secondary:
    "border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 disabled:hover:bg-neutral-100",
  text: "h-9 border-0 bg-transparent shadow-none px-2 text-neutral-600 hover:bg-transparent hover:text-neutral-950 hover:underline disabled:hover:bg-transparent disabled:hover:no-underline",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "font-playfair inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 enabled:cursor-pointer",
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
