/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

/* ---------------- Mock FullCalendar ---------------- */
vi.mock("@fullcalendar/react", () => ({
  __esModule: true,
  default: (props) => (
    <div data-testid="mock-calendar">
      Mock FullCalendar
      <button onClick={() => props.datesSet?.({ start: new Date(), end: new Date() })}>
        trigger-dates
      </button>
    </div>
  ),
}));

/* ---------------- Mock useAuth ---------------- */
vi.mock("/src/context/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: { id: "1", role: "Manager" } })),
}));

/* ---------------- Mock socket.io-client ---------------- */
const mockOn = vi.fn();
const mockDisconnect = vi.fn();
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: mockOn,
    disconnect: mockDisconnect,
  })),
}));

/* ---------------- Mock API ---------------- */
const mockTasks = [
  {
    _id: "t1",
    title: "Test Task",
    deadline: new Date().toISOString(),
    assignedTeamMembers: [],
    status: "To Do",
    priority: "High",
  },
];
vi.mock("/src/services/api", () => ({
  BASE: "http://mock-base",
  getCalendarTasks: vi.fn(async () => ({ tasks: mockTasks })),
  updateTaskDates: vi.fn(async () => {}),
}));

/* ---------------- Mock react.useRef() ---------------- */
// Return an API object with a `view` so `Calendar`'s useEffect runs correctly.
vi.mock("react", async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    useRef: (init) => ({
      current: {
        getApi: () => ({
          view: {
            activeStart: new Date(),
            activeEnd: new Date(),
          },
        }),
      },
    }),
  };
});

import { getCalendarTasks } from "/src/services/api";
import Calendar from "/src/pages/Calendar.jsx";

/* ---------------- Tests ---------------- */
describe("Calendar component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

//   it("renders Calendar header and description", async () => {
//     render(<Calendar />);

//     expect(screen.getByText(/mock fullcalendar/i)).toBeInTheDocument();
//     expect(screen.getByRole("heading", { name: /calendar/i })).toBeInTheDocument();
//     expect(
//       screen.getByText(/view and manage task deadlines/i)
//     ).toBeInTheDocument();

//     await waitFor(() => expect(getCalendarTasks).toHaveBeenCalled());
//   }, 10_000);

//   it("calls getCalendarTasks initially and again on datesSet trigger", async () => {
//     render(<Calendar />);

//     expect(await screen.findByTestId("mock-calendar")).toBeInTheDocument();

//     // First call from useEffect
//     await waitFor(() => expect(getCalendarTasks).toHaveBeenCalledTimes(1));

//     // Trigger mock datesSet callback
//     screen.getByText("trigger-dates").click();

//     await waitFor(() => expect(getCalendarTasks).toHaveBeenCalledTimes(2));
//   });

  it("subscribes to socket events and disconnects on unmount", () => {
    const { unmount } = render(<Calendar />);

    expect(mockOn).toHaveBeenCalledWith("calendar:task:created", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("calendar:task:updated", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("calendar:task:deleted", expect.any(Function));

    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
