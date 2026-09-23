import { describe, expect, it } from "vitest";
import { creativeFunctionError } from "./function-error";

describe("creativeFunctionError", () => {
  it("surfaces the JSON message returned by the Edge Function", async () => {
    const original = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: "Your image model is unavailable", code: "PROVIDER_ERROR" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    });

    await expect(creativeFunctionError(original)).resolves.toMatchObject({
      message: "Your image model is unavailable",
      code: "PROVIDER_ERROR",
      status: 502,
    });
  });

  it("keeps the original message when no JSON response is available", async () => {
    await expect(creativeFunctionError(new Error("Network unavailable"))).resolves.toMatchObject({ message: "Network unavailable" });
  });
});
