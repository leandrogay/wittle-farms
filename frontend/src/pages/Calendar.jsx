import { useEffect, useRef, useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { io } from "socket.io-client";
import { getCalendarTasks, updateTaskDates, BASE } from "../services/api";
import { useAuth } from "../context/useAuth";

/* ---------- Tailwind class maps ---------- */
const PRIORITY_DOT = {
  Low: "bg-blue-400 dark:bg-blue-500",
  Medium: "bg-amber-500 dark:bg-amber-400",
  High: "bg-red-500 dark:bg-red-400",
  _default: "bg-gray-400 dark:bg-gray-500",
};

// Use an inset box-shadow via Tailwind's arbitrary value to render a left color bar
const PRIORITY_LEFT = {
  Low: "shadow-[inset_4px_0_0_0_rgb(96,165,250)] dark:shadow-[inset_4px_0_0_0_rgb(59,130,246)]",
  Medium: "shadow-[inset_4px_0_0_0_rgb(245,158,11)] dark:shadow-[inset_4px_0_0_0_rgb(251,191,36)]",
  High: "shadow-[inset_4px_0_0_0_rgb(239,68,68)] dark:shadow-[inset_4px_0_0_0_rgb(248,113,113)]",
  _default: "shadow-[inset_4px_0_0_0_rgb(209,213,219)] dark:shadow-[inset_4px_0_0_0_rgb(107,114,128)]",
};

const STATUS_UNDER = {
  "To Do": "border-b-2 border-b-gray-500/60 dark:border-b-gray-400/60",
  "In Progress": "border-b-2 border-b-blue-600/80 dark:border-b-blue-500/80",
  // "Done" handled with line-through/opacity
};

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/* Dot + title (no time since displayEventTime=false) */
const eventContent = (arg) => {
  const { priority } = arg.event.extendedProps || {};
  const dot = PRIORITY_DOT[priority] || PRIORITY_DOT._default;
  return {
    html: `
      <span class="inline-block w-2 h-2 rounded-full ${dot} mr-1 align-middle"></span>
      <span class="fc-title">${escapeHtml(arg.event.title || "")}</span>
    `,
  };
};

export default function Calendar() {
  const calRef = useRef(null);
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const socketRef = useRef(null);

  // tooltip state (Tailwind styled, only position uses inline)
  const [tip, setTip] = useState({ open: false, x: 0, y: 0, members: [] });
  const moveHandlers = useRef(new WeakMap());

  const toEvent = (t) => {
    // only show tasks that actually have a deadline
    if (!t?.deadline) return null;

    return {
      id: t._id,
      title: t.title,

      // show exactly at the deadline time
      start: t.deadline,
      end: null,          // no span
      allDay: false,      // force timed (week/day views)

      extendedProps: {
        assignees: t.assignedTeamMembers,
        status: t.status,
        priority: t.priority,
      },
    };
  };

  const loadRange = useCallback(async (start, end) => {
    const { tasks } = await getCalendarTasks({
      start: start.toISOString(),
      end: end.toISOString(),
    });

    const events = tasks
      .filter(t => !!t.deadline)
      .map(toEvent)
      .filter(Boolean);

    setEvents(events);
  }, []);

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api) loadRange(api.view.activeStart, api.view.activeEnd);
  }, [loadRange]);

  useEffect(() => {
    socketRef.current = io(BASE, { withCredentials: true });
    socketRef.current.on("calendar:task:created", ({ task }) =>
      setEvents((evs) => [...evs, toEvent(task)])
    );
    socketRef.current.on("calendar:task:updated", ({ task }) =>
      setEvents((evs) => evs.map((e) => (e.id === task._id ? toEvent(task) : e)))
    );
    socketRef.current.on("calendar:task:deleted", ({ id }) =>
      setEvents((evs) => evs.filter((e) => e.id !== id))
    );
    return () => socketRef.current?.disconnect();
  }, []);

  const editable = user?.role === "Manager";

  /* ---------- Tailwind classes on each event element ---------- */
  const styleEvent = (info) => {
    const el = info.el;
    const { status, priority } = info.event.extendedProps || {};

    const base = [
      "bg-light-bg",
      "dark:bg-dark-bg",
      "border",
      "border-light-border",
      "dark:border-dark-border",
      "text-light-text-primary",
      "dark:text-dark-text-primary",
      "rounded-lg",
      "overflow-hidden",
      "transition-colors",
    ];
    el.classList.add(...base);

    const left = PRIORITY_LEFT[priority] || PRIORITY_LEFT._default;
    el.classList.add(...left.split(" "));

    const underline = STATUS_UNDER[status];
    if (underline) el.classList.add(...underline.split(" "));

    if (status === "Done") {
      el.classList.add("opacity-60");
      const title = el.querySelector(".fc-title");
      if (title) title.classList.add("line-through");
    }

    if (info.event.allDay) {
      el.classList.add("rounded-full", "px-1.5");
    }
  };

  /* ---------- Tooltip (Tailwind UI, React state) ---------- */
  const renderAssignees = (members = []) => {
    if (!members.length)
      return <div className="text-light-text-muted dark:text-dark-text-muted">No assignees</div>;
    return members.map((m, i) => {
      const initial = (m?.name || m?.email || "?").trim().charAt(0).toUpperCase();
      return (
        <div key={m?._id || m?.email || i} className="flex items-center gap-2 my-1">
          <div className="w-[22px] h-[22px] rounded-full bg-light-surface dark:bg-dark-surface overflow-hidden flex-none ring-1 ring-light-border dark:ring-dark-border">
            {m?.avatarUrl ? (
              <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-light-text-secondary dark:text-dark-text-secondary font-semibold text-xs">
                {initial}
              </div>
            )}
          </div>
          <div>
            <div className="leading-none text-light-text-primary dark:text-dark-text-primary">
              {m?.name || m?.email || "Unknown"}
            </div>
            {m?.email && (
              <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{m.email}</div>
            )}
          </div>
        </div>
      );
    });
  };

  const onEventEnter = (arg) => {
    const { assignees = [] } = arg.event.extendedProps || {};
    const r = arg.el.getBoundingClientRect();
    setTip({ open: true, x: r.right + 14, y: r.top + 14, members: assignees });

    const move = (e) =>
      setTip((t) => ({ ...t, x: e.clientX + 14, y: e.clientY + 14 }));
    arg.el.addEventListener("mousemove", move);
    moveHandlers.current.set(arg.el, move);
  };

  const onEventLeave = (arg) => {
    setTip((t) => ({ ...t, open: false }));
    const move = moveHandlers.current.get(arg.el);
    if (move) {
      arg.el.removeEventListener("mousemove", move);
      moveHandlers.current.delete(arg.el);
    }
  };

  return (
    <section className="p-4 space-y-6 relative z-0">
      {/* Header */}
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-light-text-primary dark:text-dark-text-primary">
          Calendar
        </h1>
        <p className="mt-3 text-lg text-light-text-secondary dark:text-dark-text-secondary">
          View and manage task deadlines across all projects
        </p>
      </header>

      {/* Calendar Container */}
      <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          datesSet={(arg) => loadRange(arg.start, arg.end)}
          editable={editable}
          displayEventTime={false}
          eventContent={eventContent}
          eventDidMount={styleEvent}
          eventMouseEnter={onEventEnter}
          eventMouseLeave={onEventLeave}
          eventDrop={async (info) => {
            try {
              await updateTaskDates(info.event.id, {
                startAt: info.event.start?.toISOString(),
                endAt: info.event.end?.toISOString(),
                allDay: info.event.allDay,
              });
            } catch {
              info.revert();
            }
          }}
          eventResize={async (info) => {
            try {
              await updateTaskDates(info.event.id, {
                startAt: info.event.start?.toISOString(),
                endAt: info.event.end?.toISOString(),
                allDay: info.event.allDay,
              });
            } catch {
              info.revert();
            }
          }}
          eventBackgroundColor="transparent"
          eventBorderColor="transparent"
          eventTextColor="inherit"
          nowIndicator
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          height="auto"
          views={{
            timeGridWeek: { allDaySlot: true },
            timeGridDay: { allDaySlot: true },
          }}
        />
      </div>

      {/* Tooltip */}
      {tip.open && (
        <div
          className="fixed z-[10000] bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-xl shadow-2xl p-3 text-sm pointer-events-none"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="font-semibold mb-2 text-light-text-primary dark:text-dark-text-primary">
            Assignees
          </div>
          {renderAssignees(tip.members)}
        </div>
      )}

      <style jsx global>{`
        /* FullCalendar base overrides for dark mode support */
        .fc {
          --fc-border-color: rgb(229 231 235);
          --fc-button-text-color: rgb(17 24 39);
          --fc-button-bg-color: rgb(249 250 251);
          --fc-button-border-color: rgb(229 231 235);
          --fc-button-hover-bg-color: rgb(243 244 246);
          --fc-button-hover-border-color: rgb(209 213 219);
          --fc-button-active-bg-color: rgb(229 231 235);
          --fc-button-active-border-color: rgb(209 213 219);
          --fc-today-bg-color: rgb(219 234 254 / 0.3);
        }

        .dark .fc {
          --fc-border-color: rgb(55 65 81);
          --fc-button-text-color: rgb(243 244 246);
          --fc-button-bg-color: rgb(31 41 55);
          --fc-button-border-color: rgb(55 65 81);
          --fc-button-hover-bg-color: rgb(55 65 81);
          --fc-button-hover-border-color: rgb(75 85 99);
          --fc-button-active-bg-color: rgb(75 85 99);
          --fc-button-active-border-color: rgb(107 114 128);
          --fc-today-bg-color: rgb(37 99 235 / 0.2);
        }

        /* Day headers - better contrast and background */
        .fc .fc-col-header-cell {
          background-color: rgb(249 250 251);
          border-color: var(--fc-border-color);
        }

        .dark .fc .fc-col-header-cell {
          background-color: rgb(31 41 55);
        }

        .fc .fc-col-header-cell-cushion {
          color: rgb(17 24 39);
          font-weight: 600;
          padding: 0.75rem 0.5rem;
        }

        .dark .fc .fc-col-header-cell-cushion {
          color: rgb(243 244 246);
        }

        /* Day numbers in grid */
        .fc .fc-daygrid-day-number {
          color: rgb(55 65 81);
          font-weight: 500;
          padding: 0.5rem;
        }

        .dark .fc .fc-daygrid-day-number {
          color: rgb(209 213 219);
        }

        /* Time slot labels */
        .fc .fc-timegrid-slot-label-cushion {
          color: rgb(75 85 99);
          font-weight: 500;
        }

        .dark .fc .fc-timegrid-slot-label-cushion {
          color: rgb(156 163 175);
        }

        /* Toolbar title */
        .fc .fc-toolbar-title {
          color: rgb(17 24 39);
          font-size: 1.5rem;
          font-weight: 700;
        }

        .dark .fc .fc-toolbar-title {
          color: rgb(243 244 246);
        }

        /* Button styling */
        .fc .fc-button {
          border-radius: 0.5rem;
          padding: 0.5rem 1rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .fc .fc-button:focus {
          box-shadow: 0 0 0 2px rgb(59 130 246 / 0.5);
        }

        .dark .fc .fc-button:focus {
          box-shadow: 0 0 0 2px rgb(96 165 250 / 0.5);
        }

        /* Today button special styling */
        .fc .fc-today-button {
          background-color: rgb(59 130 246) !important;
          border-color: rgb(59 130 246) !important;
          color: white !important;
        }

        .fc .fc-today-button:hover {
          background-color: rgb(37 99 235) !important;
          border-color: rgb(37 99 235) !important;
        }

        .dark .fc .fc-today-button {
          background-color: rgb(96 165 250) !important;
          border-color: rgb(96 165 250) !important;
          color: rgb(17 24 39) !important;
        }

        .dark .fc .fc-today-button:hover {
          background-color: rgb(59 130 246) !important;
          border-color: rgb(59 130 246) !important;
        }

        /* Today cell background */
        .fc .fc-day-today {
          background-color: var(--fc-today-bg-color) !important;
        }

        /* Now indicator */
        .fc .fc-timegrid-now-indicator-line {
          border-color: rgb(239 68 68);
        }

        .dark .fc .fc-timegrid-now-indicator-line {
          border-color: rgb(248 113 113);
        }

        /* Grid background */
        .fc .fc-scrollgrid {
          border-color: var(--fc-border-color);
        }

        /* Event hover effect */
        .fc-event:hover {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }

        /* Event cursor */
        .fc-event {
          cursor: pointer;
          transition: all 0.2s;
        }

        /* Slot labels in time grid */
        .fc .fc-timegrid-slot {
          height: 3rem;
        }

        /* More link styling */
        .fc .fc-more-link {
          color: rgb(59 130 246);
          font-weight: 500;
        }

        .dark .fc .fc-more-link {
          color: rgb(96 165 250);
        }
      `}</style>
    </section>
  );
}