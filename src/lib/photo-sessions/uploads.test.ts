import { describe, expect, it } from "vitest";
import { byFileName, deliverableProblem, photoContentType, photoProblem, runLimited, uploadErrorMessage } from "./uploads";

const MB = 1024 * 1024;
const file = (name: string, type: string, size = 3 * MB) => ({ name, type, size });

describe("which photos go into a session", () => {
  it("takes the JPEGs a camera exports", () => {
    expect(photoProblem(file("DSC_0042.JPG", "image/jpeg"))).toBeNull();
    expect(photoContentType(file("DSC_0042.JPG", "image/jpeg"))).toBe("image/jpeg");
  });

  it("reads the type from the extension when the browser gives none", () => {
    expect(photoContentType(file("export.jpg", ""))).toBe("image/jpeg");
    expect(photoProblem(file("export.jpg", ""))).toBeNull();
  });

  it("says why it turns away a HEIC instead of uploading something most clients cannot see", () => {
    expect(photoProblem(file("IMG_1001.HEIC", "image/heic"))).toMatch(/Export them as JPEG/);
    expect(photoProblem(file("IMG_1001.heic", ""))).toMatch(/HEIC/);
  });

  it("names the size of a photo that is too big", () => {
    expect(photoProblem(file("big.jpg", "image/jpeg", 22 * MB))).toBe("22.0 MB is over the 15 MB limit. Export it smaller.");
    expect(photoProblem(file("edge.jpg", "image/jpeg", 15 * MB))).toBeNull();
  });

  it("refuses files that are not pictures", () => {
    expect(photoProblem(file("notes.pdf", "application/pdf"))).toBe("Not a JPEG, PNG or WebP image.");
    expect(photoProblem(file("raw.CR3", ""))).toBe("Not a JPEG, PNG or WebP image.");
  });
});

describe("which deliverables are accepted", () => {
  it("takes TIFF and HEIC finals up to 50 MB", () => {
    expect(deliverableProblem(file("final.tif", "image/tiff", 48 * MB))).toBeNull();
    expect(deliverableProblem(file("final.heic", ""))).toBeNull();
    expect(deliverableProblem(file("final.tif", "image/tiff", 60 * MB))).toBe("60.0 MB is over the 50 MB limit.");
  });
});

describe("the order of a shoot", () => {
  it("puts IMG_2 before IMG_10", () => {
    const names = ["IMG_10.jpg", "img_2.jpg", "IMG_1.jpg", "IMG_100.jpg"].map((name) => ({ name }));
    expect(names.sort(byFileName).map((entry) => entry.name)).toEqual(["IMG_1.jpg", "img_2.jpg", "IMG_10.jpg", "IMG_100.jpg"]);
  });
});

describe("running a batch a few at a time", () => {
  it("never has more than the limit in flight and finishes everything", async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await runLimited(Array.from({ length: 20 }, (_, i) => i), 4, async (item) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      done.push(item);
    });
    expect(peak).toBe(4);
    expect(done.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("keeps going past a failure and reports which ones failed", async () => {
    const failures = await runLimited(["a", "b", "c"], 2, async (item) => {
      if (item === "b") throw new Error("boom");
    });
    expect(failures.map((failure) => failure.item)).toEqual(["b"]);
  });
});

describe("upload errors in words", () => {
  it("turns storage errors into something a person can act on", () => {
    expect(uploadErrorMessage({ message: "The object exceeded the maximum allowed size" })).toBe("Over the size limit.");
    expect(uploadErrorMessage(new TypeError("Failed to fetch"))).toBe("The connection dropped. Retry it.");
    expect(uploadErrorMessage(undefined)).toBe("Upload failed.");
  });
});
