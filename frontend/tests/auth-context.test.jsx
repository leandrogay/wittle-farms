/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import React, { useContext } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the API module used by AuthProvider
let mockWarnCb, mockLogoutCb;
vi.mock("/src/services/api", () => ({
    clearToken: vi.fn(),
    getToken: vi.fn(() => null),
    refreshAccessToken: vi.fn(async () => { }),
    scheduleLogoutWarning: vi.fn((token, onWarn, onLogout) => {
        mockWarnCb = onWarn;
        mockLogoutCb = onLogout;
    }),
}));

import {
    clearToken,
    getToken,
    refreshAccessToken,
    scheduleLogoutWarning,
} from "/src/services/api";
import AuthProvider, { AuthCtx } from "/src/context/AuthContext.jsx";

function Consumer() {
    const { user, loading, login, logout } = useContext(AuthCtx);
    return (
        <div>
            <div data-testid="loading">{String(loading)}</div>
            <div data-testid="user">{user ? user.email : "null"}</div>
            <button onClick={() => login({ email: "e@example.com", name: "E" }, "tkn")}>
                do-login
            </button>
            <button onClick={logout}>do-logout</button>
        </div>
    );
}

function renderWithProvider(ui = <Consumer />) {
    return render(<AuthProvider>{ui}</AuthProvider>);
}

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockWarnCb = undefined;
    mockLogoutCb = undefined;
});

describe("AuthProvider", () => {
    it("bootstraps user from localStorage and arms timers if token exists", () => {
        localStorage.setItem("user", JSON.stringify({ email: "boot@x.com" }));
        vi.mocked(getToken).mockReturnValue("abc123");

        renderWithProvider();

        expect(screen.getByTestId("loading")).toHaveTextContent("false");
        expect(screen.getByTestId("user")).toHaveTextContent("boot@x.com");
        expect(scheduleLogoutWarning).toHaveBeenCalledWith(
            "abc123",
            expect.any(Function),
            expect.any(Function)
        );
    });

    it("handles invalid localStorage user gracefully", () => {
        localStorage.setItem("user", "{not:json");
        renderWithProvider();

        expect(screen.getByTestId("loading")).toHaveTextContent("false");
        expect(screen.getByTestId("user")).toHaveTextContent("null");
    });

    it("login persists user and arms timers", () => {
        renderWithProvider();

        fireEvent.click(screen.getByText("do-login"));

        expect(localStorage.getItem("user")).toContain('"email":"e@example.com"');
        expect(screen.getByTestId("user")).toHaveTextContent("e@example.com");
        expect(scheduleLogoutWarning).toHaveBeenCalledWith(
            "tkn",
            expect.any(Function),
            expect.any(Function)
        );
    });

    it("shows warning banner when scheduler triggers warn callback", async () => {
        vi.mocked(getToken).mockReturnValue("t1");
        renderWithProvider();

        // simulate the scheduler calling the warning callback
        mockWarnCb?.();

        expect(await screen.findByText(/you’ll be logged out soon/i)).toBeInTheDocument();
    });

    it("Stay logged in refreshes token and re-arms timers, hides banner", async () => {
        vi.mocked(getToken)
            .mockReturnValueOnce("old")   // initial mount
            .mockReturnValueOnce("new1"); // after refresh

        renderWithProvider();

        // show the banner
        mockWarnCb?.();
        expect(await screen.findByText(/you’ll be logged out soon/i)).toBeInTheDocument();

        // click the "Stay logged in" button
        fireEvent.click(screen.getByRole("button", { name: /stay logged in/i }));

        await waitFor(() => {
            expect(refreshAccessToken).toHaveBeenCalled();
            expect(scheduleLogoutWarning).toHaveBeenLastCalledWith(
                "new1",
                expect.any(Function),
                expect.any(Function)
            );
            // banner should be gone
            expect(screen.queryByText(/you’ll be logged out soon/i)).not.toBeInTheDocument();
        });
    });

    it("Log out now clears user, localStorage and token", async () => {
        localStorage.setItem("user", JSON.stringify({ email: "x@y.com" }));
        renderWithProvider();

        // trigger the warning (which sets state asynchronously)
        mockWarnCb?.();

        // wait for banner to appear
        await waitFor(() => {
            expect(
                screen.getByText((content) => content.includes("logged out soon"))
            ).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /log out now/i }));

        // now assert the rest
        await waitFor(() => {
            expect(screen.getByTestId("user")).toHaveTextContent("null");
            expect(localStorage.getItem("user")).toBeNull();
            expect(clearToken).toHaveBeenCalled();
            expect(
                screen.queryByText((content) => content.includes("logged out soon"))
            ).not.toBeInTheDocument();
        });
    });


    it("if refresh fails while staying logged in, it logs out", async () => {
        vi.mocked(getToken).mockReturnValue("old");
        vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error("nope"));

        renderWithProvider();

        mockWarnCb?.();
        expect(await screen.findByText(/you’ll be logged out soon/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /stay logged in/i }));

        await waitFor(() => {
            expect(screen.getByTestId("user")).toHaveTextContent("null");
        });
    });
});
