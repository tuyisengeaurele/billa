export interface MomoCredentials {
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  targetEnvironment: string;
  baseUrl: string;
}

export const MOMO_BASE_URLS: Record<"sandbox" | "production", string> = {
  sandbox: "https://sandbox.momodeveloper.mtn.com",
  // Confirm this against MTN's current Rwanda Collections API onboarding docs before
  // going live — MTN's production host isn't verified against a live account here.
  production: "https://proxy.momoapi.mtn.com",
};

export class MomoApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export async function getAccessToken(creds: MomoCredentials): Promise<string> {
  const basicAuth = Buffer.from(`${creds.apiUser}:${creds.apiKey}`).toString("base64");
  const response = await fetch(`${creds.baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
    },
  });
  if (!response.ok) {
    throw new MomoApiError("Couldn't authenticate with MTN MoMo", response.status);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

export async function requestToPay(
  creds: MomoCredentials,
  token: string,
  input: {
    referenceId: string;
    amount: number;
    phoneNumber: string;
    externalId: string;
    payerMessage: string;
    payeeNote: string;
  },
): Promise<void> {
  const response = await fetch(`${creds.baseUrl}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
      "X-Reference-Id": input.referenceId,
      "X-Target-Environment": creds.targetEnvironment,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(input.amount),
      currency: "RWF",
      externalId: input.externalId,
      payer: { partyIdType: "MSISDN", partyId: input.phoneNumber },
      payerMessage: input.payerMessage,
      payeeNote: input.payeeNote,
    }),
  });
  if (response.status !== 202) {
    throw new MomoApiError("MTN MoMo rejected the payment request", response.status);
  }
}

export async function getRequestToPayStatus(
  creds: MomoCredentials,
  token: string,
  referenceId: string,
): Promise<{ status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason?: string }> {
  const response = await fetch(`${creds.baseUrl}/collection/v1_0/requesttopay/${referenceId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
      "X-Target-Environment": creds.targetEnvironment,
    },
  });
  if (!response.ok) {
    throw new MomoApiError("Couldn't check MTN MoMo payment status", response.status);
  }
  const body = (await response.json()) as { status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason?: string };
  return { status: body.status, reason: body.reason };
}
