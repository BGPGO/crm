"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WabaHomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/waba/dashboard");
  }, [router]);
  return null;
}
