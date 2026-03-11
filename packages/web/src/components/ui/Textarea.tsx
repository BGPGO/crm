"use client";

import clsx from "clsx";
import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, rows = 3, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          className={clsx(
            "px-3 py-2 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 resize-vertical",
            error
              ? "border-red-400 focus:ring-red-400 bg-red-50"
              : "border-gray-300 focus:ring-blue-500 focus:border-blue-500 bg-white",
            "placeholder:text-gray-400",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
