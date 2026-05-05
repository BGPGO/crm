"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export type Brand = "BGP" | "AIMO";

type BrandContextValue = {
  brand: Brand;
  setBrand: (b: Brand) => void;
};

const BrandContext = createContext<BrandContextValue | null>(null);

const STORAGE_KEY = "crm.brand";
const COOKIE_NAME = "crm-brand";

function isBrand(v: unknown): v is Brand {
  return v === "BGP" || v === "AIMO";
}

/** Read brand fresh from storage/cookie. Safe for SSR (returns null on server). */
export function readBrand(): Brand | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isBrand(stored)) return stored;
  } catch {
    // ignore (private mode, disabled storage, etc.)
  }
  try {
    const match = document.cookie.match(/(?:^|;\s*)crm-brand=(BGP|AIMO)/);
    if (match && isBrand(match[1])) return match[1];
  } catch {
    // ignore
  }
  return null;
}

export function BrandProvider({ children }: { children: ReactNode }) {
  // SSR-safe: server always renders BGP. Client hydrates from storage in effect.
  const [brand, setBrandState] = useState<Brand>("BGP");

  useEffect(() => {
    const stored = readBrand();
    if (stored && stored !== brand) {
      setBrandState(stored);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setBrand = (b: Brand) => {
    setBrandState(b);
    try {
      window.localStorage.setItem(STORAGE_KEY, b);
    } catch {
      // ignore
    }
    try {
      document.cookie = `${COOKIE_NAME}=${b}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore
    }
    // Force a full reload so every query/SWR cache refetches with the new X-Brand.
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <BrandContext.Provider value={{ brand, setBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand outside BrandProvider");
  return ctx;
}
