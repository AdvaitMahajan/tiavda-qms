import "@testing-library/jest-dom";

// Suites that render PDFs run under `@vitest-environment node`, where there is
// no window to patch — the shim is only needed for the jsdom component tests.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
