import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SW_SOURCE = fs.readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

type Listener = (event: any) => void;

function loadServiceWorker(options: { fetchImpl?: (request: any) => Promise<any>; cached?: Map<string, any> } = {}) {
  const listeners: Record<string, Listener> = {};
  const store = options.cached ?? new Map<string, any>();
  const cache = {
    add: vi.fn(async (url: string) => {
      store.set(url, { offline: true });
    }),
    put: vi.fn(async (request: any, response: any) => {
      store.set(request.url, response);
    }),
  };
  const caches = {
    open: vi.fn(async () => cache),
    match: vi.fn(async (request: any) => store.get(typeof request === "string" ? request : request.url)),
    keys: vi.fn(async () => ["billa-static-v1", "old-cache"]),
    delete: vi.fn(async () => true),
  };
  const self = {
    location: { origin: "https://billa.example" },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  const context = {
    self,
    caches,
    fetch: options.fetchImpl ?? (async () => ({ ok: true, clone: () => ({}) })),
    URL,
  };
  vm.runInNewContext(SW_SOURCE, context);
  return { listeners, caches, cache, self, store };
}

function fetchEvent(url: string, init: { method?: string; mode?: string } = {}) {
  const respondWith = vi.fn();
  return { event: { request: { url, method: init.method ?? "GET", mode: init.mode ?? "no-cors" }, respondWith }, respondWith };
}

describe("service worker", () => {
  it("keeps the offline page when it installs", async () => {
    const { listeners, cache } = loadServiceWorker();
    let installed: Promise<unknown> | undefined;

    listeners.install!({ waitUntil: (promise: Promise<unknown>) => (installed = promise) });
    await installed;

    expect(cache.add).toHaveBeenCalledWith("/offline.html");
  });

  it("clears older caches when it activates", async () => {
    const { listeners, caches, self } = loadServiceWorker();
    let activated: Promise<unknown> | undefined;

    listeners.activate!({ waitUntil: (promise: Promise<unknown>) => (activated = promise) });
    await activated;

    expect(caches.delete).toHaveBeenCalledWith("old-cache");
    expect(caches.delete).not.toHaveBeenCalledWith("billa-static-v1");
    expect(self.clients.claim).toHaveBeenCalled();
  });

  it("shows the offline page when a page load fails", async () => {
    const store = new Map<string, any>([["/offline.html", { offline: true }]]);
    const { listeners } = loadServiceWorker({ fetchImpl: async () => Promise.reject(new Error("offline")), cached: store });
    const { event, respondWith } = fetchEvent("https://billa.example/dashboard", { mode: "navigate" });

    listeners.fetch!(event);
    const response = await respondWith.mock.calls[0]![0];

    expect(response).toEqual({ offline: true });
  });

  it("serves a page load from the network when it is available", async () => {
    const live = { ok: true, live: true };
    const { listeners } = loadServiceWorker({ fetchImpl: async () => live });
    const { event, respondWith } = fetchEvent("https://billa.example/dashboard", { mode: "navigate" });

    listeners.fetch!(event);

    expect(await respondWith.mock.calls[0]![0]).toBe(live);
  });

  it("never touches API calls or other same-origin data requests", () => {
    const { listeners } = loadServiceWorker();
    const { event, respondWith } = fetchEvent("https://billa.example/documents?page=1");

    listeners.fetch!(event);

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("ignores writes and other origins", () => {
    const { listeners } = loadServiceWorker();
    const post = fetchEvent("https://billa.example/assets/app.js", { method: "POST" });
    const external = fetchEvent("https://apis.google.com/js/api.js");

    listeners.fetch!(post.event);
    listeners.fetch!(external.event);

    expect(post.respondWith).not.toHaveBeenCalled();
    expect(external.respondWith).not.toHaveBeenCalled();
  });

  it("serves a hashed build file from the cache once it has one", async () => {
    const cachedFile = { ok: true, fromCache: true };
    const store = new Map<string, any>([["https://billa.example/assets/app-abc.js", cachedFile]]);
    const fetchImpl = vi.fn();
    const { listeners } = loadServiceWorker({ fetchImpl, cached: store });
    const { event, respondWith } = fetchEvent("https://billa.example/assets/app-abc.js");

    listeners.fetch!(event);

    expect(await respondWith.mock.calls[0]![0]).toBe(cachedFile);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caches a hashed build file the first time it is fetched", async () => {
    const network = { ok: true, clone: () => ({ copy: true }) };
    const { listeners, cache } = loadServiceWorker({ fetchImpl: async () => network });
    const { event, respondWith } = fetchEvent("https://billa.example/assets/app-abc.js");

    listeners.fetch!(event);
    await respondWith.mock.calls[0]![0];
    await Promise.resolve();

    expect(cache.put).toHaveBeenCalledWith(event.request, { copy: true });
  });
});
