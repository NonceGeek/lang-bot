"use client";

import { ReactNode } from "react";

interface WalletProviderProps {
  children: ReactNode;
}

// Wallet provider stub — @aptos-labs dependencies removed
export function WalletProvider({ children }: WalletProviderProps) {
  return <>{children}</>;
}
