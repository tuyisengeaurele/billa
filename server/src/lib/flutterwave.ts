const FLUTTERWAVE_API_BASE = "https://api.flutterwave.com/v3";

function secretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not set");
  }
  return key;
}

interface InitiateCheckoutParams {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customerEmail: string;
}

interface FlutterwavePaymentResponse {
  status: string;
  data: { link: string };
}

export async function initiateCheckout(params: InitiateCheckoutParams): Promise<{ link: string }> {
  const response = await fetch(`${FLUTTERWAVE_API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: params.txRef,
      amount: params.amount,
      currency: params.currency,
      redirect_url: params.redirectUrl,
      customer: { email: params.customerEmail },
      customizations: { title: "Billa" },
    }),
  });

  const data = (await response.json()) as FlutterwavePaymentResponse;
  if (!response.ok || data.status !== "success") {
    throw new Error("Failed to initiate Flutterwave checkout");
  }
  return { link: data.data.link };
}

export interface VerifiedTransaction {
  txRef: string;
  amount: number;
  currency: string;
  status: string;
}

interface FlutterwaveVerifyResponse {
  status: string;
  data: { tx_ref: string; amount: number; currency: string; status: string };
}

export async function verifyTransaction(transactionId: string): Promise<VerifiedTransaction> {
  const response = await fetch(`${FLUTTERWAVE_API_BASE}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });

  const data = (await response.json()) as FlutterwaveVerifyResponse;
  if (!response.ok || data.status !== "success") {
    throw new Error("Failed to verify Flutterwave transaction");
  }
  return {
    txRef: data.data.tx_ref,
    amount: data.data.amount,
    currency: data.data.currency,
    status: data.data.status,
  };
}
