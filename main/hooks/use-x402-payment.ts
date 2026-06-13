// x402 payment hook stub — @aptos-labs dependencies removed
export function useX402Payment() {
  const payForAccess = async (_paymentRequirements: any): Promise<string> => {
    throw new Error("Wallet not connected — @aptos-labs removed");
  };

  return { payForAccess, isConnected: false };
}
