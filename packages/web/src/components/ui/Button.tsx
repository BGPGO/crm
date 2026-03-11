import clsx from "clsx";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 border border-transparent shadow-sm",
  secondary:
    "bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300 border border-gray-300 shadow-sm",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 border border-transparent shadow-sm",
  ghost:
    "bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-300 border border-transparent",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-md gap-1.5",
  md: "px-4 py-2 text-sm rounded-lg gap-2",
  lg: "px-5 py-2.5 text-base rounded-lg gap-2",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-0.5 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
