import mongoose from "mongoose";
const { isValidObjectId } = mongoose;

export function localPart(email = "") {
  return String(email).split("@")[0]?.toLowerCase() || "";
}

export const AT_TOKEN_RE = /(^|[\s(])@([a-z0-9._+-]{1,64})\b/gi;

export function extractHandles(text = "") {
  const out = new Set();
  for (const m of String(text).matchAll(AT_TOKEN_RE)) out.add(m[2].toLowerCase());
  return [...out];
}

export function isOid(v) {
  return typeof v === "string" && isValidObjectId(v);
}
