import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import {
  listTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  getMe, 
} from "../../services/api";

const socket = io(import.meta.env.VITE_API_BASE_URL || "http://localhost:3000", {
  withCredentials: true,
});

//dedupe -> prevents the 2 child error 
const sortDesc = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const dedupeById = (arr) => {
  const map = new Map();
  for (const c of arr) map.set(c._id, c); 
  return Array.from(map.values()).sort(sortDesc);
};

function pickUser(me) {
  const u = me?.user ?? me; 
  if (!u || typeof u !== "object") return { id: null, name: "", email: "" };
  return {
    id: u._id ?? u.id ?? null,
    name: u.name ?? u.username ?? u.email ?? "Unknown",
    email: u.email ?? "",
  };
}

export default function TaskComments({ taskId, currentUser }) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);

  const [me, setMe] = useState(() => (currentUser ? pickUser(currentUser) : null));
  const [loadingMe, setLoadingMe] = useState(!currentUser);

  const inputRef = useRef(null);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    try {
      const { items: page, nextCursor: nc } = await listTaskComments(taskId, {
        cursor: nextCursor,
        limit: 20,
      });
      //setItems((prev) => [...prev, ...page]);
      setItems(prev => dedupeById([...prev, ...page]));
      setNextCursor(nc);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadMore();
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setLoadingMe(true);
      getMe()
        .then((raw) => {
          if (!cancelled) setMe(pickUser(raw));
        })
        .catch(() => {
          if (!cancelled) setMe(null);
        })
        .finally(() => {
          if (!cancelled) setLoadingMe(false);
        });
    } else {
      setMe(pickUser(currentUser));
      setLoadingMe(false);
    }
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    const onCreate = ({ taskId: t, comment }) => t === taskId && setItems(prev => (prev.some(c => c._id === comment._id) ? prev : [comment, ...prev].sort(sortDesc)));
    //setItems((prev) => [comment, ...prev]);
    const onUpdate = ({ taskId: t, comment }) =>
      t === taskId && setItems((prev) => prev.map((c) => (c._id === comment._id ? comment : c)));
    const onDelete = ({ taskId: t, commentId }) =>
      t === taskId && setItems((prev) => prev.filter((c) => c._id !== commentId));

    socket.on("task:comment:created", onCreate);
    socket.on("task:comment:updated", onUpdate);
    socket.on("task:comment:deleted", onDelete);
    return () => {
      socket.off("task:comment:created", onCreate);
      socket.off("task:comment:updated", onUpdate);
      socket.off("task:comment:deleted", onDelete);
    };
  }, [taskId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const val = (inputRef.current?.value || "").trim();
    if (!val) return;

    if (loadingMe) {
      alert("Loading your session… try again in a second.");
      return;
    }
    if (!me?.id) {
      alert("You must be signed in to comment.");
      return;
    }

    const tempId = `tmp-${Date.now()}`;
    setItems((prev) => [
      {
        _id: tempId,
        body: val,
        createdAt: new Date().toISOString(),
        author: { _id: me.id, name: me.name, email: me.email },
      },
      ...prev,
    ]);
    if (inputRef.current) inputRef.current.value = "";

    try {
      const saved = await createTaskComment(taskId, { body: val, authorId: me.id });
      //setItems((prev) => prev.map((c) => (c._id === tempId ? saved : c)));
      setItems(prev => dedupeById(prev.map(c => (c._id === tempId ? saved : c))));
    } catch (err) {
      setItems((prev) => prev.filter((c) => c._id !== tempId));
      alert(err?.message || "Failed to post comment");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Write a comment…"
          className="flex-1 rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-[--color-brand-primary]"
          disabled={loadingMe}
        />
        <button type="submit" className="rounded-xl border px-3 py-2 hover:opacity-90" disabled={loadingMe}>
          Post
        </button>
      </form>

      <ul className="space-y-3">
        {items.map((c) => {
          const isOwner = me?.id && String(c.author?._id) === String(me.id);
          return (
            <li key={c._id} className="rounded-2xl border p-3 bg-[--color-light-surface] dark:bg-[--color-dark-surface]">
              <div className="text-sm text-slate-600 dark:text-[--color-dark-text-secondary]">
                <strong className="text-slate-900 dark:text-[--color-dark-text-primary]">
                  {c.author?.name || (isOwner ? "You" : "Unknown")}
                </strong>{" "}
                · {new Date(c.createdAt).toLocaleString()}
                {c.editedAt ? " · (edited)" : null}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-slate-900 dark:text-[--color-dark-text-primary]">{c.body}</div>

              {isOwner && (
                <div className="mt-2 flex gap-3 text-sm text-[--color-brand-primary]">
                  <button
                    type="button"
                    onClick={async () => {
                      const next = window.prompt("Edit comment:", c.body);
                      if (!next || !next.trim() || next === c.body) return;
                      try {
                        const updated = await updateTaskComment(taskId, c._id, { body: next.trim() });
                        setItems((prev) => prev.map((i) => (i._id === c._id ? updated : i)));
                      } catch {
                        alert("Failed to update comment");
                      }
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("Delete this comment?")) return;
                      const snap = items;
                      setItems((prev) => prev.filter((i) => i._id !== c._id));
                      try {
                        await deleteTaskComment(taskId, c._id);
                      } catch {
                        setItems(snap);
                        alert("Failed to delete comment");
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {nextCursor && (
        <div className="text-center">
          <button onClick={loadMore} disabled={loading} className="rounded-xl border px-3 py-2">
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
