import clsx from "clsx";
import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export default function Card({
  padding = "md",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        "bg-white rounded-xl border border-gray-200 shadow-sm",
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("flex items-center justify-between mb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={clsx("text-sm font-semibold text-gray-900", className)}
      {...props}
    >
      {children}
    </h3>
  );
}
