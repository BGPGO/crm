"use client";

import Header from "@/components/layout/Header";
import WabaNav from "@/components/waba/WabaNav";

export default function WabaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="WhatsApp Cloud API" breadcrumb={["WABA"]} />
      <WabaNav />
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
