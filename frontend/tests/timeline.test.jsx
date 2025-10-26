/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Timeline from "/src/components/ui/Timeline.jsx";

describe("Timeline component", () => {
    it("renders 'No tasks to display' when empty", () => {
        render(<Timeline items={[]} />);
        expect(screen.getByText(/no tasks to display/i)).toBeInTheDocument();
    });

    it("renders task titles", () => {
        const tasks = [
            { id: 1, title: "Task A", startAt: "2025-10-25T00:00:00Z" },
            { id: 2, title: "Task B", startAt: "2025-10-26T00:00:00Z" },
        ];
        render(<Timeline items={tasks} />);
        expect(screen.getByText("Task A")).toBeInTheDocument();
        expect(screen.getByText("Task B")).toBeInTheDocument();
    });

    it("renders 'Overdue' badge for past deadline", () => {
        const tasks = [
            {
                id: 1,
                title: "Overdue Task",
                startAt: "2025-10-20T00:00:00Z",
                deadline: "2025-10-21T00:00:00Z",
                status: "In Progress",
            },
        ];

        render(<Timeline items={tasks} />);

        // Specific and robust:
        expect(screen.getByTitle("This task is past its deadline")).toBeInTheDocument();
    });


    it("renders 'Completed:' for done tasks", () => {
        const tasks = [
            {
                id: 1,
                title: "Done Task",
                startAt: "2025-10-20T00:00:00Z",
                completedAt: "2025-10-22T00:00:00Z",
                status: "Done",
            },
        ];
        render(<Timeline items={tasks} />);
        expect(screen.getByText(/completed:/i)).toBeInTheDocument();
    });

    it("calls onItemClick when a task is clicked", () => {
        const handleClick = vi.fn();
        const task = { id: 1, title: "Clickable Task", startAt: "2025-10-25T00:00:00Z" };

        render(<Timeline items={[task]} onItemClick={handleClick} />);

        fireEvent.click(screen.getByText("Clickable Task"));
        expect(handleClick).toHaveBeenCalledWith(expect.objectContaining({ title: "Clickable Task" }));
    });
});
