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
});
