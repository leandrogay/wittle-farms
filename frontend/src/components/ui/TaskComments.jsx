import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import {
  listTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  getMe,
} from "../../services/api";

// Socket (one client for the module)
const socket = io(import.meta.env.VITE_API_BASE_URL || "http://localhost:3000", {
  withCredentials: true,
});

// Helpers
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
      setItems((prev) => dedupeById([...prev, ...page]));
      setNextCursor(nc);
    } finally {
      setLoading(false);
    }
  }

  // (Re)load when task changes
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Resolve current user
  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setLoadingMe(true);
      getMe()
        .then((raw) => !cancelled && setMe(pickUser(raw)))
        .catch(() => !cancelled && setMe(null))
        .finally(() => !cancelled && setLoadingMe(false));
    } else {
      setMe(pickUser(currentUser));
      setLoadingMe(false);
    }
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Realtime events
  useEffect(() => {
    const onCreate = ({ taskId: t, comment }) => {
      if (t !== taskId) return;
      setItems((prev) => dedupeById([comment, ...prev]));
    };
    const onUpdate = ({ taskId: t, comment }) => {
      if (t !== taskId) return;
      setItems((prev) => prev.map((c) => (c._id === comment._id ? comment : c)));
    };
    const onDelete = ({ taskId: t, commentId }) => {
      if (t !== taskId) return;
      setItems((prev) => prev.filter((c) => c._id !== commentId));
    };

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

    // Optimistic add
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
      setItems((prev) => dedupeById(prev.map((c) => (c._id === tempId ? saved : c))));
    } catch (err) {
      setItems((prev) => prev.filter((c) => c._id !== tempId));
      alert(err?.message || "Failed to post comment");
    }
  }

  async function onEdit(comment) {
    const next = window.prompt("Edit comment:", comment.body);
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === comment.body) return;

    try {
      const updated = await updateTaskComment(taskId, comment._id, {
        body: trimmed,
        authorId: me?.id,
      });
      setItems((prev) => prev.map((i) => (i._id === comment._id ? updated : i)));
    } catch (err) {
      alert(err?.message || "Failed to update comment");
    }
  }

  async function onDelete(comment) {
    if (!window.confirm("Delete this comment?")) return;
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i._id !== comment._id));
    try {
      await deleteTaskComment(taskId, comment._id, { authorId: me?.id });
    } catch (err) {
      setItems(snapshot); // rollback
      alert(err?.message || "Failed to delete comment");
    }
  }

  return (
    <div className="space-y-4">
      {/* Composer */}
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

      {/* List */}
      <ul className="space-y-3">
        {items.map((c) => {
          const ownerId = me?.id ? String(me.id) : null;
          const authorId = c.author?._id ? String(c.author._id) : null;
          const isOwner = ownerId && authorId && ownerId === authorId;

          return (
            <li
              key={c._id}
              className="rounded-2xl border p-3 bg-[--color-light-surface] dark:bg-[--color-dark-surface]"
            >
              <div className="text-sm text-slate-600 dark:text-[--color-dark-text-secondary]">
                <strong className="text-slate-900 dark:text-[--color-dark-text-primary]">
                  {c.author?.name || (isOwner ? "You" : "Unknown")}
                </strong>{" "}
                · {new Date(c.createdAt).toLocaleString()}
                {c.editedAt ? (
                  <span className="ml-1 text-xs text-slate-500 dark:text-[--color-dark-text-muted]">(edited)</span>
                ) : null}
              </div>

              <div className="mt-1 whitespace-pre-wrap text-slate-900 dark:text-[--color-dark-text-primary]">
                {c.body}
              </div>

              {isOwner && (
                <div className="mt-2 flex gap-3 text-sm text-[--color-brand-primary]">
                  <button type="button" onClick={() => onEdit(c)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => onDelete(c)}>
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

