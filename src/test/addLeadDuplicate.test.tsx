import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...a: unknown[]) => apiGet(...a),
    post: (...a: unknown[]) => apiPost(...a),
    patch: (...a: unknown[]) => apiPatch(...a),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/intakeTokenUtils", () => ({
  createIntakeToken: vi.fn().mockResolvedValue("tok"),
  getIntakeUrl: () => "https://example.test/intake/tok",
}));
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => vi.fn(),
}));

import { AddLeadDialog } from "@/components/AddLeadDialog";

/** An existing client whose number is stored in a different format to the one typed. */
const EXISTING = {
  id: "client-1",
  name: "Rahul Sharma",
  company: "ABC Builders",
  city: "Pune",
  phone: "+91 98765 43210",
  email: "rahul@abc.test",
  lead_source: "referral",
  service_type_interest: "soil_investigation",
  requirement_notes: "Original enquiry notes",
};

function renderDialog(): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AddLeadDialog open onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return null as unknown as ReactElement;
}

/** Fill the New Client form with a duplicate phone and submit. */
async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.type(screen.getByPlaceholderText("Client or company name"), "Priya Desai");
  await user.type(screen.getByPlaceholderText("+91XXXXXXXXXX"), phone);
  await user.type(screen.getByPlaceholderText("Optional"), "XYZ Constructions");
  await user.type(screen.getByPlaceholderText("e.g. Pune"), "Mumbai");
  await user.click(screen.getByRole("button", { name: /add lead/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
    if (path === "/clients" && params?.phone) return Promise.resolve([EXISTING]);
    if (path === "/clients") return Promise.resolve([EXISTING]);
    return Promise.resolve([]);
  });
  apiPost.mockResolvedValue({ id: "new-id", ref_number: "GG-2026-0002" });
  apiPatch.mockResolvedValue({});
});

describe("AddLeadDialog — duplicate phone", () => {
  it("asks instead of silently attaching when the number is already on file", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillAndSubmit(user, "9876543210");

    expect(await screen.findByText(/this number is already on file/i)).toBeInTheDocument();
    // The matching client is named so the user can tell who they'd be attaching to.
    expect(screen.getByText(/ABC Builders/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add to this client/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create separately/i })).toBeInTheDocument();

    // Nothing is written until the user chooses.
    expect(apiPost).not.toHaveBeenCalledWith("/enquiries", expect.anything());
  });

  it("matches on the last 10 digits, not the exact string", async () => {
    const user = userEvent.setup();
    renderDialog();
    // Typed bare; stored as "+91 98765 43210". Exact equality would miss this.
    await fillAndSubmit(user, "9876543210");
    expect(await screen.findByText(/this number is already on file/i)).toBeInTheDocument();
  });

  it("'Create separately' creates a new client with the details just typed", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillAndSubmit(user, "9876543210");
    await user.click(await screen.findByRole("button", { name: /create separately/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/clients", expect.objectContaining({
        name: "Priya Desai",
        company: "XYZ Constructions",
        phone: "+919876543210", // normalised to E.164
      }));
    });
  });

  it("'Add to this client' reuses the client and never overwrites its history", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillAndSubmit(user, "9876543210");
    await user.click(await screen.findByRole("button", { name: /add to this client/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/enquiries", expect.objectContaining({
        client_id: "client-1",
      }));
    });

    // No second client record for the same number.
    expect(apiPost).not.toHaveBeenCalledWith("/clients", expect.anything());

    // The earlier lead's first-touch fields must survive, and the client's own
    // city must not be replaced by this enquiry's site city.
    for (const call of apiPatch.mock.calls) {
      const patch = call[1] as Record<string, unknown>;
      expect(patch).not.toHaveProperty("city");
      expect(patch).not.toHaveProperty("lead_source");
      expect(patch).not.toHaveProperty("requirement_notes");
      expect(patch).not.toHaveProperty("service_type_interest");
    }
  });

  it("fills a blank field on the existing client but leaves populated ones alone", async () => {
    // Same client, but with no email on file — the one field the new lead can add.
    const sparse = { ...EXISTING, email: null };
    apiGet.mockImplementation((path: string, params?: Record<string, unknown>) =>
      path === "/clients" ? Promise.resolve([sparse]) : Promise.resolve([]),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText("Client or company name"), "Priya Desai");
    await user.type(screen.getByPlaceholderText("+91XXXXXXXXXX"), "9876543210");
    await user.type(screen.getByPlaceholderText("Company name"), "priya@xyz.test");
    await user.type(screen.getByPlaceholderText("Optional"), "XYZ Constructions");
    await user.type(screen.getByPlaceholderText("e.g. Pune"), "Mumbai");
    await user.click(screen.getByRole("button", { name: /add lead/i }));
    await user.click(await screen.findByRole("button", { name: /add to this client/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    const patch = apiPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).toEqual({ email: "priya@xyz.test" }); // the blank filled, nothing else touched
  });

  it("goes straight through when the number is new", async () => {
    apiGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      if (path === "/clients" && params?.phone) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderDialog();
    await fillAndSubmit(user, "9123456780");

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/clients", expect.objectContaining({ name: "Priya Desai" }));
    });
    expect(screen.queryByText(/this number is already on file/i)).not.toBeInTheDocument();
  });
});
