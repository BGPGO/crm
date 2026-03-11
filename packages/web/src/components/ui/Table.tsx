import clsx from "clsx";
import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table
        className={clsx("w-full text-sm text-left bg-white", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHead({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={clsx("bg-gray-50 border-b border-gray-200", className)}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={clsx("divide-y divide-gray-100", className)}
      {...props}
    >
      {children}
    </tbody>
  );
}

export function TableRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={clsx(
        "hover:bg-gray-50 transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHeader({
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={clsx(
        "px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  className,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={clsx("px-4 py-3 text-gray-700", className)}
      {...props}
    >
      {children}
    </td>
  );
}
