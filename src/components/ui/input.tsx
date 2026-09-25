import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, ...props }, ref) => {
    const usernamePrefix = !icon && props.id === "username";
    const leadingAdornment = icon ?? (usernamePrefix ? (
      <span aria-hidden="true" className="text-base font-semibold leading-none text-blue-600 dark:text-blue-400">@</span>
    ) : null);

    return (
      <div className="relative min-w-0 w-full max-w-full">
        {leadingAdornment && (
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
            {leadingAdornment}
          </div>
        )}
        <input
          type={type}
          className={cn(
            "flex h-11 min-w-0 w-full max-w-full rounded-lg border border-input bg-background px-4 py-2 text-sm transition-all duration-200",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "hover:border-muted-foreground/50",
            leadingAdornment && "pl-10",
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
