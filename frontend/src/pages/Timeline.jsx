import React, { useEffect, useMemo, useState, useCallback } from "react";
import Timeline from "../components/ui/Timeline";
import { getMe } from "../services/api";

const toDateOrNull = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(+d) ? null : d;
};
const isoOrEmpty = (v) => (v ? new Date(v).toISOString() : "");

// helpers for filtering
const isDone = (i) => !!i.completedAt || String(i.status) === "Done";
const isOverdue = (i) =>
    !isDone(i) && i.deadline instanceof Date && i.deadline.getTime() < Date.now();
const hasNoDeadline = (i) => !i.deadline;
const isTodo = (i) => !isDone(i) && String(i.status) === "To Do";
const isInProgress = (i) => !isDone(i) && String(i.status) === "In Progress";

async function fetchTimeline({ userId, from, to }) {
    const params = new URLSearchParams({ user: userId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const res = await fetch(`/api/timeline?${params.toString()}`, {
        credentials: "include",
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Failed to load timeline (${res.status}): ${msg || res.statusText}`);
    }
    const json = await res.json();

    const items = (json?.items || []).map((t) => {
        const id = t.id || t._id;
        const project =
            typeof t.project === "string"
                ? t.project
                : t.assignedProject?.name || t.assignedProject?.title || "";

        return {
            id,
            title: t.title,
            project,
            status: t.status,

            createdAt: toDateOrNull(t.createdAt),
            startAt: toDateOrNull(t.startAt ?? t.startedAt ?? t.createdAt),
            endAt: toDateOrNull(t.endAt),
            deadline: toDateOrNull(t.deadline),
            completedAt: toDateOrNull(t.completedAt),
        };
    });

    return { items };
}

export default function TimelinePage() {
    const [me, setMe] = useState(null);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    useEffect(() => {
        (async () => {
            try {
                const raw = await getMe();
                setMe(raw.user ?? raw);
            } catch {
                setMe(null);
            }
        })();
    }, []);

    const userId = me?._id || me?.id;

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setError("");
        try {
            const { items } = await fetchTimeline({ userId, from, to });
            setItems(items);
        } catch (e) {
            setError(e?.message || "Failed to load timeline");
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [userId, from, to]);

    useEffect(() => {
        if (userId) void load();
    }, [userId, load]);

    const stats = useMemo(() => {
        const total = items.length;
        const done = items.filter((i) => i.completedAt || String(i.status) === "Done").length;
        return { total, done, inProgress: total - done };
    }, [items]);

    // counts for filter chips
    const counts = useMemo(() => {
        const c = { all: items.length, overdue: 0, todo: 0, inprogress: 0, done: 0, nodeadline: 0 };
        for (const i of items) {
            if (isOverdue(i)) c.overdue++;
            if (isTodo(i)) c.todo++;
            if (isInProgress(i)) c.inprogress++;
            if (isDone(i)) c.done++;
            if (hasNoDeadline(i)) c.nodeadline++;
        }
        return c;
    }, [items]);

    // apply filter
    const filtered = useMemo(() => {
        switch (statusFilter) {
            case "overdue": return items.filter(isOverdue);
            case "todo": return items.filter(isTodo);
            case "inprogress": return items.filter(isInProgress);
            case "done": return items.filter(isDone);
            case "nodeadline": return items.filter(hasNoDeadline);
            default: return items;
        }
    }, [items, statusFilter]);

    return (
        <div className="mx-auto max-w-6xl p-6 space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                        Timeline
                    </h1>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary">
                        Your assigned tasks (start → completion)
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Status filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="border rounded-lg px-2 py-1 bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary"
                        title="Filter by status"
                    >
                        <option value="all">All ({counts.all})</option>
                        <option value="overdue">Overdue ({counts.overdue})</option>
                        <option value="todo">To Do ({counts.todo})</option>
                        <option value="inprogress">In Progress ({counts.inprogress})</option>
                        <option value="done">Done ({counts.done})</option>
                        <option value="nodeadline">No deadline ({counts.nodeadline})</option>
                    </select>
                    <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2">
                        <span>From</span>
                        <input
                            type="date"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                            className="ml-0 border rounded-lg px-2 py-1 bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary"
                        />
                    </label>
                    <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2">
                        <span>To</span>
                        <input
                            type="date"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            className="ml-0 border rounded-lg px-2 py-1 bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary"
                        />
                    </label>
                    <button
                        onClick={load}
                        disabled={loading || !userId}
                        className="rounded-lg border px-3 py-1.5 bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-surface transition"
                    >
                        {loading ? "Loading…" : "Apply"}
                    </button>
                </div>
            </header>

            {error && (
                <div className="rounded-lg border border-red-300/40 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 px-3 py-2">
                    {error}
                </div>
            )}

            {/* Quick stats */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border p-4 bg-light-surface/60 dark:bg-dark-surface/60 border-light-border dark:border-dark-border">
                    <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Total</div>
                    <div className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                        {stats.total}
                    </div>
                </div>
                <div className="rounded-xl border p-4 bg-light-surface/60 dark:bg-dark-surface/60 border-light-border dark:border-dark-border">
                    <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Completed</div>
                    <div className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                        {stats.done}
                    </div>
                </div>
                <div className="rounded-xl border p-4 bg-light-surface/60 dark:bg-dark-surface/60 border-light-border dark:border-dark-border">
                    <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">In Progress</div>
                    <div className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                        {stats.inProgress}
                    </div>
                </div>
            </section>

            {/* Timeline */}
            <section className="rounded-xl border p-4 bg-light-surface/40 dark:bg-dark-surface/40 border-light-border dark:border-dark-border">
                <Timeline
                    items={filtered}
                    onItemClick={(item) => {
                        console.log("clicked", item);
                    }}
                />
            </section>

            {/* Export */}
            <section className="flex justify-end">
                <button
                    onClick={() => {
                        const rows = [
                            ["Title", "Project", "Status", "Start", "Completed", "Deadline", "Planned End"],
                            ...filtered.map((i) => [
                                i.title,
                                i.project || "",
                                i.status || "",
                                isoOrEmpty(i.startAt ?? i.createdAt),
                                isoOrEmpty(i.completedAt),
                                isoOrEmpty(i.deadline),
                                isoOrEmpty(i.endAt),
                            ]),
                        ];
                        const csv = rows
                            .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
                            .join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "timeline.csv";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                    }}
                    className="rounded-lg border px-3 py-1.5 bg-light-bg dark:bg-dark-bg border-light-border dark:border-dark-border hover:bg-light-surface dark:hover:bg-dark-surface transition"
                >
                    Export CSV
                </button>
            </section>
        </div>
    );
}
