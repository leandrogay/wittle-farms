import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { io } from "socket.io-client";
import { getCalendarTasks, updateTaskDates, BASE } from "../services/api";
import { useAuth } from "../context/AuthContext.jsx";

/* ---------- Tailwind class maps ---------- */
const PRIORITY_DOT = {
  Low: "bg-blue-400",
  Medium: "bg-amber-500",
  High: "bg-red-500",
  _default: "bg-gray-400",
};

// Use an inset box-shadow via Tailwind's arbitrary value to render a left color bar
const PRIORITY_LEFT = {
  Low: "shadow-[inset_4px_0_0_0_rgb(96,165,250)]",    // blue-400
  Medium: "shadow-[inset_4px_0_0_0_rgb(245,158,11)]", // amber-500
  High: "shadow-[inset_4px_0_0_0_rgb(239,68,68)]",    // red-500
  _default: "shadow-[inset_4px_0_0_0_rgb(209,213,219)]", // gray-300
};

const STATUS_UNDER = {
  "To Do": "border-b-2 border-b-gray-500/60",
  "In Progress": "border-b-2 border-b-blue-600/80",
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
    const hasDates = t.startAt || t.endAt;
    const deadlineOnly = !hasDates && t.deadline;
    return {
      id: t._id,
      title: t.title,
      start: t.startAt || t.deadline,
      end: t.endAt || (deadlineOnly ? null : t.deadline),
      allDay: deadlineOnly ? true : !!t.allDay,
      extendedProps: {
        assignees: t.assignedTeamMembers,
        status: t.status,
        priority: t.priority,
      },
    };
  };

  const loadRange = async (start, end) => {
    const { tasks } = await getCalendarTasks({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    setEvents(tasks.map(toEvent));
  };

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api) loadRange(api.view.activeStart, api.view.activeEnd);
  }, []);

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
      "bg-white",
      "border",
      "border-gray-200",
      "text-gray-900",
      "rounded-lg",
      "overflow-hidden",
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
      return <div className="text-gray-500">No assignees</div>;
    return members.map((m, i) => {
      const initial = (m?.name || m?.email || "?").trim().charAt(0).toUpperCase();
      return (
        <div key={m?._id || m?.email || i} className="flex items-center gap-2 my-1">
          <div className="w-[22px] h-[22px] rounded-full bg-gray-200 overflow-hidden flex-none">
            {m?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-gray-500 font-semibold text-xs">
                {initial}
              </div>
            )}
          </div>
          <div>
            <div className="leading-none">
              {m?.name || m?.email || "Unknown"}
            </div>
            {m?.email && (
              <div className="text-xs text-gray-500">{m.email}</div>
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
    <div className="p-4 relative z-0">
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
        eventBackgroundColor="#ffffff"
        eventBorderColor="#e5e7eb"
        eventTextColor="#111827"
        nowIndicator
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        height="auto"
        views={{
          timeGridWeek: { allDaySlot: false },
          timeGridDay: { allDaySlot: false },
        }}
      />

      {/* Tailwind tooltip */}
      {tip.open && (
        <div
          className="fixed z-[10000] bg-white border border-gray-200 rounded-lg shadow-xl p-2 text-sm text-gray-900 pointer-events-none"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="font-semibold mb-1">Assignees</div>
          {renderAssignees(tip.members)}
        </div>
      )}
    </div>
  );
}
