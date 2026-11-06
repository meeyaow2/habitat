import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";
import { env, storageMode } from "@/lib/env";

/**
 * Private document storage. Objects live under `<household_id>/<uuid>.<ext>`.
 * Callers must check access through the RLS-protected `documents` table
 * BEFORE calling these functions — storage itself is never exposed directly.
 */
export interface StorageAdapter {
  put(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signedUrl(objectPath: string, opts: { expiresIn: number; downloadName?: string; contentType: string }): Promise<string>;
  remove(objectPath: string): Promise<void>;
  /** Read an object's bytes (server-side only, after an RLS-checked lookup). */
  get(objectPath: string): Promise<Uint8Array>;
}

export const BUCKET = "household-documents";
const SAFE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp|heic)$/;

function assertSafe(objectPath: string) {
  if (!SAFE_PATH.test(objectPath)) throw new Error("Invalid storage path");
}

// ---------------------------------------------------------------------------
// Local filesystem (development / self-hosting)
// ---------------------------------------------------------------------------
const secret = () => new TextEncoder().encode(`${env.sessionSecret}:files`);

const local: StorageAdapter = {
  async put(objectPath, bytes) {
    assertSafe(objectPath);
    const full = path.resolve(env.localStorageDir, objectPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes, { flag: "wx" });
  },
  async signedUrl(objectPath, { expiresIn, downloadName, contentType }) {
    assertSafe(objectPath);
    const token = await new SignJWT({ p: objectPath, t: contentType, d: downloadName ?? null })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(`${expiresIn}s`)
      .sign(secret());
    return `/api/files?token=${token}`;
  },
  async remove(objectPath) {
    assertSafe(objectPath);
    await rm(path.resolve(env.localStorageDir, objectPath), { force: true });
  },
  async get(objectPath) {
    assertSafe(objectPath);
    return new Uint8Array(await readFile(path.resolve(env.localStorageDir, objectPath)));
  },
};

export async function readLocalSigned(token: string) {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
  const objectPath = String(payload.p);
  assertSafe(objectPath);
  const bytes = await readFile(path.resolve(env.localStorageDir, objectPath));
  return { bytes, contentType: String(payload.t), downloadName: payload.d ? String(payload.d) : null };
}

// ---------------------------------------------------------------------------
// Supabase Storage (private bucket, service role used server-side only)
// ---------------------------------------------------------------------------
function supabaseAdapter(): StorageAdapter {
  const client = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, { auth: { persistSession: false } });
  const bucket = () => client.storage.from(BUCKET);
  return {
    async put(objectPath, bytes, contentType) {
      assertSafe(objectPath);
      const { error } = await bucket().upload(objectPath, bytes, { contentType, upsert: false });
      if (error) throw error;
    },
    async signedUrl(objectPath, { expiresIn, downloadName }) {
      assertSafe(objectPath);
      const { data, error } = await bucket().createSignedUrl(objectPath, expiresIn, downloadName ? { download: downloadName } : undefined);
      if (error || !data) throw error ?? new Error("Could not sign URL");
      return data.signedUrl;
    },
    async remove(objectPath) {
      assertSafe(objectPath);
      const { error } = await bucket().remove([objectPath]);
      if (error) throw error;
    },
    async get(objectPath) {
      assertSafe(objectPath);
      const { data, error } = await bucket().download(objectPath);
      if (error || !data) throw error ?? new Error("Could not read file");
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

export function storage(): StorageAdapter {
  return storageMode() === "supabase" ? supabaseAdapter() : local;
}

// ---------------------------------------------------------------------------
// File type detection by content (never trust the client's declared type)
// ---------------------------------------------------------------------------
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function sniffType(bytes: Uint8Array): { mime: string; ext: string } | null {
  const b = bytes;
  const ascii = (start: number, len: number) => String.fromCharCode(...b.slice(start, start + len));
  if (ascii(0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && ascii(1, 3) === "PNG") return { mime: "image/png", ext: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(4, 4) === "ftyp" && ["heic", "heix", "mif1", "msf1", "hevc"].includes(ascii(8, 4))) return { mime: "image/heic", ext: "heic" };
  return null;
}
