export const MERCHANT_TON_ADDRESS = "UQBnIrZ0TjM-iL0nowg7p9mDrO3Ge4E0_HSTSaB3xf5uKdE8"; 
// آدرس تست خودت را بگذار (testnet)

export function buildTonTransaction(nanoTon) {
  const validUntil = Math.floor(Date.now() / 1000) + 600;
  return {
    validUntil,
    messages: [
      {
        address: MERCHANT_TON_ADDRESS,
        amount: String(nanoTon), // nanoTON string
      },
    ],
  };
}