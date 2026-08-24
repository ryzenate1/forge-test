import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ServerDetailLayout from "@/app/console/servers/[id]/layout";
import { useServerContext } from "@/components/server/server-context";
import { jsonResponse, mockFetchByUrl } from "@/test/fetch-mock";
import { renderWithQuery } from "@/test/render";
import { fixtureServer, makeServer, fixtureUser } from "@/test/fixtures";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }), useParams: () => ({ id: "s1" }) }));

function Probe() {
  const { server, access, refreshServer } = useServerContext();
  return (
    <div>
      <p>Server: {server.name}</p>
      <p>Admin: {String(access.isAdmin)}</p>
      <button type="button" onClick={() => void refreshServer()}>Refresh</button>
    </div>
  );
}

describe("server detail layout", () => {
  it("loads the server and current user and provides context to children", async () => {
    mockFetchByUrl({
      "/servers/s1": jsonResponse(fixtureServer),
      "/auth/me": jsonResponse(fixtureUser),
    });
    renderWithQuery(
      <ServerDetailLayout>
        <Probe />
      </ServerDetailLayout>
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText("Server: Game")).toBeInTheDocument();
    expect(screen.getByText("Admin: true")).toBeInTheDocument();
  });

  it("treats a 401 current-user response as an anonymous viewer", async () => {
    mockFetchByUrl({
      "/servers/s1": jsonResponse(fixtureServer),
      "/auth/me": jsonResponse({ message: "unauthorized" }, 401),
    });
    renderWithQuery(
      <ServerDetailLayout>
        <Probe />
      </ServerDetailLayout>
    );
    expect(await screen.findByText("Admin: false")).toBeInTheDocument();
  });

  it("shows the error state with retry when the server fetch fails", async () => {
    const mocked = mockFetchByUrl({
      "/servers/s1": jsonResponse({ message: "boom" }, 500),
      "/auth/me": jsonResponse(fixtureUser),
    });
    renderWithQuery(
      <ServerDetailLayout>
        <Probe />
      </ServerDetailLayout>
    );
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent(/Unable to load server/);
    expect(screen.queryByText(/Server:/)).not.toBeInTheDocument();
    mocked.fetchMock.mockResolvedValueOnce(jsonResponse(makeServer({ name: "Reloaded" })));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Server: Reloaded", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});