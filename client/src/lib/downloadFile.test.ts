import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./downloadFile";

describe("downloadFile", () => {
  beforeAll(() => {
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => "";
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => {};
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the given path with credentials and triggers a download", async () => {
    const blob = new Blob(["a,b\n1,2"], { type: "text/csv" });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(blob, { status: 200 }));
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadFile("/admin/users/export.csv", "users.csv");

    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(String(calledUrl)).toContain("/admin/users/export.csv");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:fake-url");
  });

  it("throws when the response is not ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 403 }));

    await expect(downloadFile("/admin/users/export.csv", "users.csv")).rejects.toThrow();
  });
});
