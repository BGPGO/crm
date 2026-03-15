"use client";

import clsx from "clsx";

interface EmailPreviewProps {
  html: string;
  className?: string;
}

export default function EmailPreview({ html, className }: EmailPreviewProps) {
  return (
    <iframe
      srcDoc={html}
      sandbox=""
      className={clsx(
        "w-full border border-gray-200 rounded-xl bg-white",
        className
      )}
      title="Email Preview"
      style={{ minHeight: 400 }}
    />
  );
}
