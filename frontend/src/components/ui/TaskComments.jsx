import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import {
listTaskComments,
createTaskComment,
updateTaskComment,
deleteTaskComment,
getMe,
searchMentionableUsers,
} from "../../services/api";

const socket = io(import.meta.env.VITE_API_BASE_URL || "http://localhost:3000", {
withCredentials: true,
});

const sortDesc = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const dedupeById = (arr) => {
const map = new Map();
for (const c of arr) map.set(c._id, c);
return Array.from(map.values()).sort(sortDesc);
};
const isObjectId = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
const isTempId = (s) => typeof s === "string" && s.startsWith("tmp-");


const AT_TOKEN_RE = /(^|[\s(])@([a-z0-9._+-]{0,64})$/i;
function findAtToken(value, caret) {
const left = value.slice(0, caret);
const m = AT_TOKEN_RE.exec(left);
if (!m) return null;
const start = caret - (m[2].length + 1);
return { query: m[2].toLowerCase(), start, end: caret }; // query can be ""
}

function renderWithMentions(text) {
  return String(text).split(/(@[a-z0-9._+-]{2,64})/gi).map((p, i) =>
    p.startsWith("@")
      ? <span key={i} className="mention-chip-inline">{p}</span>
      : <span key={i}>{p}</span>
  );
}

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

const textareaRef = useRef(null);
const [text, setText] = useState("");
const [suggest, setSuggest] = useState({ open: false, items: [], token: null });
const mentionCache = useRef(new Map()); 

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

useEffect(() => {
setItems([]);
setNextCursor(null);
void loadMore();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [taskId]);

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

useEffect(() => {
const onCreate = ({ taskId: t, comment }) => {
  if (t !== taskId) return;
  setItems((prev) => (prev.some((c) => c._id === comment._id) ? prev : dedupeById([comment, ...prev])));
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

async function onChange(e) {
const v = e.target.value;
setText(v);

const caret = e.target.selectionStart ?? v.length;
const token = findAtToken(v, caret);
if (!token) {
setSuggest({ open: false, items: [], token: null });
return;
}

const q = token.query;
try {
const list = await searchMentionableUsers(taskId, q);
setSuggest({ open: true, items: list, token });
} catch {
setSuggest({ open: false, items: [], token: null });
}
}

function insertHandle(u) {
if (!suggest.open || !suggest.token) return;
const before = text.slice(0, suggest.token.start);
const after = text.slice(suggest.token.end);
const next = `${before}@${u.handle}${after} `;
setText(next);
setSuggest({ open: false, items: [], token: null });

requestAnimationFrame(() => {
  const el = textareaRef.current;
  if (!el) return;
  const pos = (before + `@${u.handle} `).length;
  el.setSelectionRange(pos, pos);
  el.focus();
});
}

async function handleSubmit(e) {
e.preventDefault();
const val = text.trim();
if (!val) return;

if (loadingMe) {
  alert("Loading… try again in a second.");
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

try {
  const saved = await createTaskComment(taskId, { body: val, authorId: me.id });
  setItems((prev) => dedupeById(prev.map((c) => (c._id === tempId ? saved : c))));
} catch (err) {
  setItems((prev) => prev.filter((c) => c._id !== tempId));
  alert(err?.message || "Failed to post comment");
} finally {
  setText("");
}
}

async function onEdit(comment) {
if (!isObjectId(taskId)) {
  alert("Task is still loading. Try again in a moment.");
  return;
}
if (!isObjectId(comment._id) || isTempId(comment._id)) {
  await loadMore();
  alert("Comment is syncing. Please try again.");
  return;
}

const next = window.prompt("Edit comment:", comment.body);
if (!next) return;
const trimmed = next.trim();
if (!trimmed || trimmed === comment.body) return;

try {
  const updated = await updateTaskComment(taskId, comment._id, { body: trimmed, authorId: me.id });
  setItems((prev) => prev.map((i) => (i._id === comment._id ? updated : i)));
} catch (err) {
  alert(err?.message || "Failed to update comment");
}
}

async function onDelete(comment) {
if (!isObjectId(taskId) || !isObjectId(comment._id) || isTempId(comment._id)) {
  await loadMore();
  alert("Comment is syncing. Please try again.");
  return;
}
if (!window.confirm("Delete this comment?")) return;
const snapshot = items;
setItems((prev) => prev.filter((i) => i._id !== comment._id));
try {
  await deleteTaskComment(taskId, comment._id, { authorId: me?.id });
} catch (err) {
  setItems(snapshot);
  alert(err?.message || "Failed to delete comment");
}
}

return (
<div className="space-y-4">
  {/* Composer with @mentions */}
  <form onSubmit={handleSubmit} className="flex flex-col gap-2">
    <textarea
      ref={textareaRef}
      value={text}
      onChange={onChange}
      rows={2}
      placeholder="Write a comment… Use @ to mention"
      className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-[--color-brand-primary]"
      disabled={loadingMe}
    />
    {suggest.open && suggest.items.length > 0 && (
      <div className="z-20 w-full max-w-xl rounded-xl border p-2 bg-[--color-light-surface] dark:bg-[--color-dark-surface] shadow max-h-60 overflow-auto">
        {suggest.items.map((u) => (
          <button
            key={u._id}
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2 py-1 hover:bg-[--color-light-bg] dark:hover:bg-[--color-dark-bg]"
            onClick={() => insertHandle(u)}
          >
            <span>@{u.handle}</span>
            <span className="text-xs text-slate-500">{u.name || u.email}</span>
          </button>
        ))}
      </div>
    )}
    <div className="flex justify-end">
      <button type="submit" className="rounded-xl border px-3 py-2 hover:opacity-90" disabled={loadingMe}>
        Post
      </button>
    </div>
  </form>

  {/* List */}
  <ul className="space-y-3">
    {items.map((c) => {
      const ownerId = me?.id ? String(me.id) : null;
      const authorId = c.author?._id ? String(c.author._id) : null;
      const isOwner = ownerId && authorId && ownerId === authorId;
      const ready = isObjectId(c._id);

      return (
        <li key={c._id} className="rounded-2xl border p-3 bg-[--color-light-surface] dark:bg-[--color-dark-surface]">
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
            {renderWithMentions(c.body)}
          </div>

          {isOwner && (
            <div className="mt-2 flex gap-3 text-sm text-[--color-brand-primary]">
              <button type="button" onClick={() => onEdit(c)} disabled={!ready}>
                Edit
              </button>
              <button type="button" onClick={() => onDelete(c)} disabled={!ready}>
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
