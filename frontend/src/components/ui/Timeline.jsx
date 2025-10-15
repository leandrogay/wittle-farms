import React, { useMemo } from "react";

function toValidDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(+d) ? null : d;
}

export default function Timeline({ items = [], onItemClick }) {
    const { rows, minTs, maxTs } = useMemo(() => {
        const norm = items.map((t) => {
            const start =
                toValidDate(t.startAt) ||
                toValidDate(t.startedAt) ||
                toValidDate(t.createdAt) ||
                toValidDate(t.start) ||
                new Date();

            const deadline = toValidDate(t.deadline);
            const endPlan = toValidDate(t.endAt);
            const completed = toValidDate(t.completedAt);
            const isDone = !!completed || String(t.status) === "Done";

            const plannedEnd = isDone
                ? completed
                : (deadline || null);

            const now = new Date();
            const elapsedEnd = plannedEnd
                ? (isDone ? plannedEnd : new Date(Math.min(now.getTime(), plannedEnd.getTime())))
                : null;
            const overdue = !isDone && !!deadline && deadline.getTime() < now.getTime();

            return {
                ...t,
                start,
                deadline,
                endPlan,
                completed,
                isDone,
                overdue,
                hasDeadline: !!deadline,
                hasEndPlan: !!endPlan,
                plannedEnd,
                elapsedEnd,
            };
        });

        const nowTs = Date.now();
        const dist = (d) => (d ? Math.abs(d.getTime() - nowTs) : Number.POSITIVE_INFINITY);

        norm.sort((a, b) => {
            // Buckets: 0 = not done w/ deadline, 1 = not done w/o deadline, 2 = done
            const bucket = (t) =>
                !t.isDone && t.deadline ? 0 : (!t.isDone ? 1 : 2);

            const ba = bucket(a);
            const bb = bucket(b);
            if (ba !== bb) return ba - bb;

            // Within bucket 0: closest deadline to today (abs distance), tie-breaker by earlier deadline
            if (ba === 0) {
                const da = dist(a.deadline);
                const db = dist(b.deadline);
                if (da !== db) return da - db;
                return a.deadline.getTime() - b.deadline.getTime();
            }

            // Within bucket 1 (no deadline, not done): most recent start first (or fallback to createdAt)
            const aStart = a.start?.getTime?.() ?? 0;
            const bStart = b.start?.getTime?.() ?? 0;
            if (aStart !== bStart) return bStart - aStart; // newer first

            // Within bucket 2 (done): most recently completed first
            const aDone = a.completed?.getTime?.() ?? 0;
            const bDone = b.completed?.getTime?.() ?? 0;
            return bDone - aDone;
        });

        // Global axis for positioning
        let min = Infinity, max = -Infinity;
        for (const r of norm) {
            const s = r.start?.getTime?.() ?? NaN;
            const e = (r.plannedEnd?.getTime?.() ?? r.start?.getTime?.() ?? NaN);
            if (Number.isFinite(s)) min = Math.min(min, s);
            if (Number.isFinite(e)) max = Math.max(max, e);
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            const now = Date.now(); min = now - 1; max = now;
        }
        return { rows: norm, minTs: min, maxTs: max };
    }, [items]);

    const span = maxTs - minTs || 1;
    const pct = (x) => Math.min(100, Math.max(0, (x / span) * 100));
    const fmt = (d) => (d ? (d instanceof Date ? d : new Date(d)).toLocaleString() : "—");
    const fmtDate = (d) => (d ? (d instanceof Date ? d : new Date(d)).toLocaleDateString() : "—");

    return (
        <ol className="relative ps-6 border-s border-light-border dark:border-dark-border">
            {rows.map((t) => {
                const fullWidthPct = t.plannedEnd ? 100 : 0;

                // progress within the task's own span (0..1), then scale by the task's full width
                let progress = 0;
                if (t.plannedEnd) {
                    const denom = Math.max(1, t.plannedEnd.getTime() - t.start.getTime()); // avoid /0
                    const numer = Math.max(0, Math.min(
                        (t.elapsedEnd ? t.elapsedEnd.getTime() : t.start.getTime()) - t.start.getTime(),
                        denom
                    ));
                    progress = numer / denom; // 0..1
                }

                const safeLeft = 0;
                const safeFullWidth = fullWidthPct;
                const safeElapsedWidth = t.overdue ? safeFullWidth : progress * safeFullWidth;

                const leftLabel = fmtDate(t.start);
                const rightLabel = t.isDone
                    ? fmtDate(t.completed)
                    : t.hasDeadline
                        ? fmtDate(t.deadline)
                        : "No deadline";

                return (
                    <li
                        key={t.id}
                        className="mb-6 cursor-default rounded-2xl border p-4 bg-[--color-light-surface] dark:bg-[--color-dark-surface] border-light-border dark:border-dark-border"
                        onClick={onItemClick ? () => onItemClick(t) : undefined}
                    >
                        {/* rail dot */}
                        <span className="absolute -start-1.5 mt-1 size-3 rounded-full bg-[--color-brand-primary] dark:bg-[--color-brand-secondary]" />

                        {/* header row */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold text-light-text-primary dark:text-dark-text-primary">
                                {t.title}
                            </div>
                            {t.project ? (
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-light-bg/90 dark:bg-dark-bg/90 border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary">
                                    Project: {t.project}
                                </span>
                            ) : null}
                            {t.status ? (
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-light-bg/90 dark:bg-dark-bg/90 border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary">
                                    {t.status}
                                </span>
                            ) : null}
                            {t.overdue && (
                                <span
                                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full border
                bg-red-50 dark:bg-red-900/20
                border-red-200/70 dark:border-red-500/50
                text-red-700 dark:text-red-200"
                                    title="This task is past its deadline"
                                >
                                    Overdue
                                </span>
                            )}
                        </div>

                        {/* dates */}
                        <div className="mt-1 text-sm">
                            <div className="text-light-text-secondary dark:text-dark-text-secondary">
                                <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Started:</span>{" "}
                                {fmt(t.start)}
                            </div>

                            {t.isDone ? (
                                <div className="text-light-text-secondary dark:text-dark-text-secondary">
                                    <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Completed:</span>{" "}
                                    {fmt(t.completed)}
                                </div>
                            ) : t.hasDeadline ? (
                                <div className="text-light-text-secondary dark:text-dark-text-secondary">
                                    <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Deadline:</span>{" "}
                                    {fmt(t.deadline)}
                                </div>
                            ) : (
                                <div className="text-light-text-secondary dark:text-dark-text-secondary">
                                    <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Deadline:</span>{" "}
                                    <span className="italic">No deadline</span>
                                </div>
                            )}
                        </div>

                        {/* duration bar */}
                        <div className="mt-3">
                            <div
                                className={
                                    "relative w-full rounded-full border " +
                                    (t.plannedEnd
                                        ? "h-3 bg-black/30 dark:bg-white/8 border-white/25 dark:border-white/20"
                                        : "h-[2px] bg-transparent border-white/10 dark:border-white/10")
                                }
                            >
                                {/* Full planned span (neutral) */}
                                {t.plannedEnd && safeFullWidth > 0 && (
                                    <div
                                        className="absolute top-0 h-3 rounded-full bg-white/15 dark:bg-white/10"
                                        style={{ left: `${safeLeft}%`, width: `${safeFullWidth}%` }}
                                    />
                                )}

                                {/* Elapsed span (green) */}
                                {t.plannedEnd && safeElapsedWidth > 0 && (
                                    <div
                                        className={
                                            "absolute top-0 h-3 rounded-full ring-2 " +
                                            (t.overdue
                                                ? "bg-red-500 ring-red-300"
                                                : (t.isDone ? "bg-sky-500 ring-sky-300" : "bg-sky-500/90 ring-sky-300/80"))
                                        }
                                        style={{ left: `${safeLeft}%`, width: `${safeElapsedWidth}%` }}
                                        title={
                                            t.isDone
                                                ? `${fmt(t.start)} → ${fmt(t.completed)} (elapsed)`
                                                : `${fmt(t.start)} → ${fmt(t.elapsedEnd)} (elapsed)`
                                        }
                                    >
                                        <div
                                            className={
                                                "absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full " +
                                                (t.overdue
                                                    ? "bg-red-400 ring-2 ring-red-200"
                                                    : (t.isDone ? "bg-sky-400 ring-2 ring-sky-200" : "bg-white ring-2 ring-white/60"))
                                            }
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Per-item axis labels */}
                            <div className="mt-1 flex justify-between text-xs text-light-text-muted dark:text-dark-text-muted">
                                <span>{leftLabel}</span>
                                <span>{rightLabel}</span>
                            </div>
                        </div>
                    </li>
                );
            })}

            {!rows.length && (
                <div className="text-light-text-secondary dark:text-dark-text-secondary">
                    No tasks to display.
                </div>
            )}
        </ol>
    );
}
