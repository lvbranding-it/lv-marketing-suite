import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadResumable = vi.fn();
vi.mock("@/lib/storage/resumableUpload", () => ({ uploadResumable: (...args: unknown[]) => uploadResumable(...args) }));

import {
  CLIENT_FILE_MAX_BYTES,
  CLIENT_VIDEO_MAX_BYTES,
  formatBytes,
  sendClientFile,
  uploadProblem,
} from "./clientUpload";

const MB = 1024 * 1024;
const picked = (name: string, type: string, size: number) => ({ name, type, size });

describe("which files a client can send", () => {
  it("takes a video up to 500 MB", () => {
    expect(uploadProblem(picked("walkthrough.mp4", "video/mp4", 480 * MB))).toBeNull();
    expect(uploadProblem(picked("walkthrough.mp4", "video/mp4", CLIENT_VIDEO_MAX_BYTES))).toBeNull();
  });

  it("knows a .mov is a video even when the browser gives it no type", () => {
    expect(uploadProblem(picked("IMG_0042.MOV", "", 300 * MB))).toBeNull();
  });

  it("keeps other files at 50 MB", () => {
    expect(uploadProblem(picked("logo.ai", "application/postscript", CLIENT_FILE_MAX_BYTES))).toBeNull();
    expect(uploadProblem(picked("logo.ai", "application/postscript", 60 * MB))).toBe(
      "Files can be up to 50 MB (videos up to 500 MB).",
    );
  });

  it("tells the client what to do with a video that is too big", () => {
    expect(uploadProblem(picked("event.mov", "video/quicktime", 612 * MB))).toMatch(/^Videos can be up to 500 MB\. Export a smaller version/);
  });

  it("refuses an empty file", () => {
    expect(uploadProblem(picked("logo.png", "image/png", 0))).toBe("This file is empty.");
  });

  it("writes sizes the way the page shows them", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(500 * MB)).toBe("500 MB");
    expect(formatBytes(2048 * 1024 * MB)).toBe("2048 GB");
  });
});

describe("sending a file", () => {
  const calls: Array<Record<string, unknown>> = [];
  const file = new File([new Uint8Array(16)], "event.mov", { type: "" });

  beforeEach(() => {
    calls.length = 0;
    uploadResumable.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        const reply = body.action === "start" ? { ok: true, path: "org/req/1-event.mov", signature: "sig" } : { ok: true };
        return new Response(JSON.stringify(reply), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("gets a signature, sends the file to storage with it, then records it", async () => {
    const onStored = vi.fn();
    await sendClientFile({ token: "tok", file, message: "  Final cut  ", onStored });

    expect(calls.map((call) => call.action)).toEqual(["start", "finish"]);
    expect(calls[0]).toMatchObject({ token: "tok", file_name: "event.mov", file_size: 16, content_type: "video/quicktime" });
    expect(uploadResumable).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "client-uploads",
        objectName: "org/req/1-event.mov",
        contentType: "video/quicktime",
        auth: { signature: "sig" },
      }),
    );
    expect(onStored).toHaveBeenCalledWith("org/req/1-event.mov");
    expect(calls[1]).toMatchObject({ path: "org/req/1-event.mov", file_name: "event.mov", message: "Final cut" });
  });

  it("does not ask the client who they are", async () => {
    await sendClientFile({ token: "tok", file });
    expect(calls[1]).not.toHaveProperty("uploader_name");
    expect(calls[1]).not.toHaveProperty("uploader_email");
    expect(calls[1].message).toBeNull();
  });

  it("only records a file that already reached storage", async () => {
    await sendClientFile({ token: "tok", file, storedPath: "org/req/1-event.mov" });
    expect(calls.map((call) => call.action)).toEqual(["finish"]);
    expect(uploadResumable).not.toHaveBeenCalled();
  });

  it("passes on the reason the link refused the file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "This link has expired" }), { status: 410 })),
    );
    await expect(sendClientFile({ token: "tok", file })).rejects.toThrow("This link has expired");
    expect(uploadResumable).not.toHaveBeenCalled();
  });
});
