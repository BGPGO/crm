import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type WabaUnreadCount = {
  aiUnseen: number;
  unread: number;
  total: number;
};

export function useWabaUnreadCount(): WabaUnreadCount {
  const [data, setData] = useState<WabaUnreadCount>({ aiUnseen: 0, unread: 0, total: 0 });

  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      try {
        const res = await api.get<{ data: WabaUnreadCount }>(
          "/wa/conversations/unread-count"
        );
        if (mounted && res?.data) setData(res.data);
      } catch {
        // silent — badge é best-effort
      }
    };
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return data;
}
