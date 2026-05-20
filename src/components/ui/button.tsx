import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 enabled:cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-emerald-100",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-neutral-950 text-white shadow-sm hover:bg-neutral-800",
        destructive:
          "border border-transparent bg-red-600 text-white shadow-sm hover:bg-red-700",
        outline:
          "border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50",
        secondary:
          "border border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
        ghost: "border border-transparent bg-transparent text-neutral-700 hover:bg-neutral-100",
        link: "border border-transparent bg-transparent text-neutral-950 underline-offset-4 hover:underline",
        text: "h-9 border-0 bg-transparent px-2 text-neutral-600 shadow-none hover:bg-transparent hover:text-neutral-950 hover:underline disabled:hover:bg-transparent disabled:hover:no-underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6",
        icon: "size-9 rounded-xl p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn("font-playfair", buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
