import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveAkahuClient } from "../src/akahu/live-client.js";

/**
 * Seam 2, HTTP side. These assert the exact query string we put on the wire,
 * because Akahu's pagination has one property that is easy to get wrong and
 * invisible in a fake: a cursor does NOT carry the `start` filter that produced
 * it. Following a cursor without re-sending `start` silently widens the query
 * to all history, so an incremental sync degenerates into a full backfill.
 */
function stubFetch(body: unknown) {
  const calls: string[] = [];
  const fake = vi.fn(async (url: string) => {
    calls.push(String(url));
    return { ok: true, status: 200, statusText: "OK", json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fake);
  return calls;
}

const creds = { appToken: "app_test", userToken: "user_test" };

describe("LiveAkahuClient.listTransactions query construction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("re-sends start on every page so the cursor cannot widen the window", async () => {
    const calls = stubFetch({ success: true, items: [], cursor: { next: null } });
    const client = new LiveAkahuClient(creds);

    await client.listTransactions({
      start: "2026-07-08T00:00:00.000Z",
      cursor: "CURSOR_PAGE_2",
    });

    const url = calls[0];
    expect(url).toContain("cursor=CURSOR_PAGE_2");
    expect(url).toContain(`start=${encodeURIComponent("2026-07-08T00:00:00.000Z")}`);
  });

  it("sends start alone on the first page of a window", async () => {
    const calls = stubFetch({ success: true, items: [], cursor: { next: null } });
    const client = new LiveAkahuClient(creds);

    await client.listTransactions({ start: "2026-07-08T00:00:00.000Z", cursor: null });

    expect(calls[0]).toContain(`start=${encodeURIComponent("2026-07-08T00:00:00.000Z")}`);
    expect(calls[0]).not.toContain("cursor=");
  });

  it("sends no filters at all for a full backfill", async () => {
    const calls = stubFetch({ success: true, items: [], cursor: { next: null } });
    const client = new LiveAkahuClient(creds);

    await client.listTransactions({ start: null, cursor: null });

    expect(calls[0]).toMatch(/\/transactions$/);
  });

  it("reports hasMore from the cursor Akahu returns", async () => {
    stubFetch({ success: true, items: [], cursor: { next: "NEXT" } });
    const client = new LiveAkahuClient(creds);

    const page = await client.listTransactions({ cursor: null });

    expect(page).toMatchObject({ nextCursor: "NEXT", hasMore: true });
  });
});
