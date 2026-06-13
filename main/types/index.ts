// Type definitions for Movement Network Frontend Template

export interface WalletState {
  isConnected: boolean;
  address?: string;
  network?: string;
}

export interface TransactionResult {
  hash: string;
  status: "pending" | "success" | "failed";
  timestamp: number;
}
