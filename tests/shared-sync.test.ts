import { describe, it, expect } from "vitest";
import { checkShared } from "../scripts/sync-shared";

describe("shared game logic", () => {
  it("is in sync between src/lib and the Edge Function", () => {
    // The Deno function and the browser must apply identical rules; run `npm run sync:shared` if this fails.
    expect(checkShared()).toEqual([]);
  });
});
