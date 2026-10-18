import { expect, it, vi } from "vitest";
import { registerServiceWorker } from "../register-service-worker";
const mocks = vi.hoisted(() => ({ register: vi.fn(), info: vi.fn(), update: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({ registerSW: mocks.register }));
vi.mock("@/lib/toast", () => ({ toast: { info: mocks.info } }));
it("offers an explicit reload instead of automatically restarting the app", () => {
  mocks.register.mockReturnValue(mocks.update);
  registerServiceWorker();
  const options = mocks.register.mock.calls[0][0];
  expect(options.immediate).toBe(true);
  options.onNeedReload();
  expect(mocks.info).toHaveBeenCalledWith(
    "An app update is ready",
    expect.objectContaining({
      action: expect.objectContaining({
        props: expect.objectContaining({ variant: "link", children: "Reload" }),
      }),
    })
  );
});
