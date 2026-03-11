import clsx from "clsx";
import { HTMLAttributes } from "react";

type BadgeVariant =
  | "blue"
  | "green"
  | "yellow"
  | "red"
  | "gray"
  | "purple"
  | "orange";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-700",
  red: "bg-red-100 text-red-700",
  gray: "bg-gray-100 text-gray-600",
  purple: "bg-purple-100 text-purple-700",
  orange: "bg-orange-100 text-orange-700",
};

export default function Badge({
  variant = "gray",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
