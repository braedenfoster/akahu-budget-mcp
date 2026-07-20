import type {
  AkahuAccount,
  AkahuClient,
  AkahuTransaction,
  AkahuTransactionsPage,
} from "./types.js";

const AKAHU_BASE_URL = "https://api.akahu.io/v1";

export interface AkahuCredentials {
  appToken: string;
  userToken: string;
}

/**
 * Live HTTP implementation of the Akahu client port. Constructed per Connection
 * with that Connection's credential pair. Credentials are held in memory only
 * and are never logged. The sync engine depends on the AkahuClient interface,
 * not this class (Seam 2).
 */
export class LiveAkahuClient implements AkahuClient {
  constructor(private readonly creds: AkahuCredentials) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.creds.userToken}`,
      "X-Akahu-Id": this.creds.appToken,
      Accept: "application/json",
    };
  }

  private async request<T>(
    path: string,
  ): Promise<{ items: T; cursor?: { next?: string | null } }> {
    const res = await fetch(`${AKAHU_BASE_URL}${path}`, { headers: this.headers() });
    if (!res.ok) {
      // Deliberately omit headers/body detail that could leak credentials.
      throw new Error(`Akahu request failed: ${res.status} ${res.statusText} (${path})`);
    }
    const body = (await res.json()) as {
      success?: boolean;
      items?: T;
      cursor?: { next?: string | null };
    };
    if (body.success === false || body.items === undefined) {
      throw new Error(`Akahu returned an unsuccessful response for ${path}`);
    }
    return { items: body.items, cursor: body.cursor };
  }

  async listAccounts(): Promise<AkahuAccount[]> {
    const { items } = await this.request<AkahuAccount[]>("/accounts");
    return items;
  }

  async listTransactions(opts: { cursor: string | null }): Promise<AkahuTransactionsPage> {
    const query = opts.cursor ? `?cursor=${encodeURIComponent(opts.cursor)}` : "";
    const { items, cursor } = await this.request<AkahuTransaction[]>(
      `/transactions${query}`,
    );
    const next = cursor?.next ?? null;
    return { items, nextCursor: next, hasMore: next !== null };
  }
}
