"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Download, FileImage, FileText, Search, Sparkles, Trash2, Upload, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState, Notice, Panel, Skeleton } from "@/components/ui/misc";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatDate } from "@/lib/domain/dates";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import type { AssetOption, RoomOption } from "@/features/shared/options";
import type { NormalisedExtraction } from "@/lib/ai/extraction";
import { extractDocumentAction } from "@/features/ai/extraction-actions";
import { ExtractionReviewDialog } from "@/features/ai/extraction-review";
import { assetToForm, type AssetFormValues } from "@/features/assets/form-values";
import { getAssetPanelAction } from "@/features/home/actions";

export type AiStatus = { configured: boolean; consented: boolean };
import { deleteDocumentAction, getDocumentUrlAction, updateDocumentAction } from "./actions";
import { useOnChange, useOnOpen } from "@/lib/client/use-on-change";

const KINDS: [string, string][] = [
  ["receipt", "Receipt"],
  ["warranty", "Warranty"],
  ["manual", "Manual"],
  ["invoice", "Service invoice"],
  ["repair_report", "Repair report"],
  ["renovation", "Renovation"],
  ["other", "Other"],
];
const kindLabel = (k: string) => KINDS.find(([v]) => v === k)?.[1] ?? "Other";

export type Doc = {
  id: string; title: string; kind: string; mime_type: string; size_bytes: number; created_at: string; document_date: string | null;
  original_filename: string | null; notes: string | null; asset_id: string | null; asset_name: string | null; uploaded_by: string | null; uploaded_by_name: string | null;
};

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadDialog({ open, onOpenChange, assets, defaultKind = "receipt", defaultAssetId = "" }: { open: boolean; onOpenChange: (o: boolean) => void; assets: AssetOption[]; defaultKind?: string; defaultAssetId?: string }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState(defaultKind);
  const [assetId, setAssetId] = React.useState(defaultAssetId);
  const [documentDate, setDocumentDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useOnOpen(open, () => {
    setFile(null); setTitle(""); setKind(defaultKind); setAssetId(defaultAssetId); setDocumentDate(""); setError(null);
  });

  const choose = (f: File | undefined | null) => {
    if (!f) return;
    setError(null);
    if (f.size > 20 * 1024 * 1024) return setError("Files must be 20 MB or smaller.");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 160));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a file to upload.");
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("title", title);
    fd.set("kind", kind);
    if (assetId) fd.set("assetId", assetId);
    if (documentDate) fd.set("documentDate", documentDate);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed. Please try again.");
      toast.success("Document uploaded");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Upload a document" description="PDF or photo, up to 20 MB. Stored privately — only your household can open it." size="md">
        <form onSubmit={submit} noValidate>
          <DialogBody className="flex flex-col gap-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
              className={cn("flex flex-col items-center rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors", dragging ? "border-accent bg-accent-soft/50" : "border-line-strong bg-surface-muted/40")}
            >
              <UploadCloud className="size-6 text-fg-subtle" aria-hidden />
              {file ? (
                <p className="mt-2 text-sm font-medium">{file.name} <span className="font-normal text-fg-muted">· {size(file.size)}</span></p>
              ) : (
                <p className="mt-2 text-sm text-fg-muted">Drag a file here, or</p>
              )}
              <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => inputRef.current?.click()}>
                {file ? "Choose another file" : "Choose file"}
              </Button>
              <input ref={inputRef} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" capture={undefined} onChange={(e) => choose(e.target.files?.[0])} aria-label="Document file" />
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="doc-title" className="sm:col-span-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Type" htmlFor="doc-kind">
                <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
                  {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Document date" htmlFor="doc-date" optional>
                <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
              </Field>
              <Field label="Link to item" htmlFor="doc-asset" optional className="sm:col-span-2" hint={kind === "receipt" || kind === "warranty" ? "Becomes the proof attached to the item’s warranty." : undefined}>
                <NativeSelect value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                  <option value="">Not linked</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </NativeSelect>
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!file}><Upload aria-hidden /> Upload</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentLibrary({ docs, assets, rooms, currency, ai, canDeleteAll, userId, initialUpload, initialAssetId, initialDoc }: { docs: Doc[]; assets: AssetOption[]; rooms: RoomOption[]; currency: string; ai: AiStatus; canDeleteAll: boolean; userId: string; initialUpload: string | null; initialAssetId: string | null; initialDoc: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [upload, setUpload] = React.useState(!!initialUpload);
  const [viewing, setViewing] = React.useState<string | null>(initialDoc);
  const [q, setQ] = React.useState(params.get("q") ?? "");

  const setParam = React.useCallback((k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    for (const key of ["upload", "asset", "doc"]) if (key !== k) next.delete(key);
    if (v) next.set(k, v); else next.delete(k);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  React.useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => setParam("q", q || null), 250);
    return () => clearTimeout(t);
  }, [q, params, setParam]);

  const doc = docs.find((d) => d.id === viewing) ?? null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <label htmlFor="doc-search" className="sr-only">Search documents</label>
          <input id="doc-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, file names or items" className="h-10 w-full rounded-md border border-line-input bg-surface pl-9 pr-3 text-base shadow-xs placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 sm:h-9" />
        </div>
        <div className="sm:w-48">
          <label htmlFor="doc-kind-f" className="sr-only">Type</label>
          <NativeSelect id="doc-kind-f" value={params.get("kind") ?? ""} onChange={(e) => setParam("kind", e.target.value || null)}>
            <option value="">All types</option>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </div>
        <Button variant="primary" onClick={() => setUpload(true)}><Upload aria-hidden /> Upload</Button>
      </div>

      {docs.length === 0 ? (
        <Panel>
          <EmptyState icon={<FileText />} title={params.get("q") || params.get("kind") ? "No matching documents" : "No documents yet"} description="Keep receipts, warranty cards, manuals and service invoices here — linked to the item they belong to." action={<Button variant="primary" onClick={() => setUpload(true)}><Upload aria-hidden /> Upload a document</Button>} />
        </Panel>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => setViewing(d.id)} className="flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left shadow-xs transition-colors hover:border-line-strong">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-muted">
                  {d.mime_type === "application/pdf" ? <FileText className="size-5" aria-hidden /> : <FileImage className="size-5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">{d.asset_name ?? "Not linked"} · {size(d.size_bytes)}</span>
                  <span className="mt-2 flex items-center gap-2">
                    <Badge tone={d.kind === "receipt" || d.kind === "warranty" ? "accent" : "neutral"}>{kindLabel(d.kind)}</Badge>
                    <span className="text-[11px] text-fg-subtle">{formatDate(d.document_date ?? d.created_at.slice(0, 10))}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <UploadDialog open={upload} onOpenChange={(o) => { setUpload(o); if (!o && initialUpload) setParam("upload", null); }} assets={assets} defaultKind={initialUpload && initialUpload !== "1" ? initialUpload : "receipt"} defaultAssetId={initialAssetId ?? ""} />
      <DocumentViewer doc={doc} assets={assets} rooms={rooms} currency={currency} ai={ai} canDelete={!!doc && (canDeleteAll || doc.uploaded_by === userId)} onClose={() => { setViewing(null); if (initialDoc) setParam("doc", null); }} />
    </>
  );
}

function DocumentViewer({ doc, assets, rooms, currency, ai, canDelete, onClose }: { doc: Doc | null; assets: AssetOption[]; rooms: RoomOption[]; currency: string; ai: AiStatus; canDelete: boolean; onClose: () => void }) {
  const [reading, setReading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<null | { extractionId: string; result: NormalisedExtraction; linked: { id: string; name: string; form: AssetFormValues } | null }>(null);
  const aiSupported = !!doc && ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(doc.mime_type);

  async function readWithAi() {
    if (!doc) return;
    setReading(true);
    setAiError(null);
    try {
      const r = await extractDocumentAction(doc.id);
      if (!r.ok) return setAiError(r.error);
      let linked = null;
      if (doc.asset_id) {
        const p = await getAssetPanelAction({ id: doc.asset_id });
        if (p.ok) linked = { id: p.data.asset.id, name: p.data.asset.name, form: assetToForm(p.data.asset, p.data.warranties[0] ?? null) };
      }
      setReview({ extractionId: r.data.id, result: r.data.fields as NormalisedExtraction, linked });
    } catch {
      setAiError("We couldn’t reach Habitat. Check your connection and try again.");
    } finally {
      setReading(false);
    }
  }
  const [url, setUrl] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [meta, setMeta] = React.useState({ title: "", kind: "other", assetId: "", documentDate: "", notes: "" });
  const save = useAction(updateDocumentAction, { success: "Saved" });
  const del = useAction(deleteDocumentAction, { success: "Document deleted" });

  useOnChange(doc, (d) => {
    setUrl(null);
    setErr(null);
    if (d) setMeta({ title: d.title, kind: d.kind, assetId: d.asset_id ?? "", documentDate: d.document_date ?? "", notes: d.notes ?? "" });
  });
  React.useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    getDocumentUrlAction({ id: doc.id, download: false }).then((r) => {
      if (cancelled) return;
      if (r.ok) setUrl(r.data.url);
      else setErr(r.error);
    });
    return () => { cancelled = true; };
  }, [doc]);

  const download = async () => {
    if (!doc) return;
    const r = await getDocumentUrlAction({ id: doc.id, download: true });
    if (r.ok) window.location.href = r.data.url;
    else toast.error(r.error);
  };

  return (
    <Sheet open={!!doc} onOpenChange={(o) => !o && onClose()}>
      {doc && (
        <SheetContent title={doc.title} description={`${kindLabel(doc.kind)} · ${size(doc.size_bytes)}${doc.uploaded_by_name ? ` · uploaded by ${doc.uploaded_by_name.split(" ")[0]}` : ""}`} className="md:w-[560px]">
          <div className="border-b border-line bg-surface-muted">
            {err ? (
              <div className="p-5"><Notice tone="danger">{err}</Notice></div>
            ) : !url ? (
              <Skeleton className="h-[52vh] w-full rounded-none" />
            ) : doc.mime_type === "application/pdf" ? (
              <iframe src={url} title={`Preview of ${doc.title}`} className="h-[52vh] w-full bg-white" />
            ) : doc.mime_type === "image/heic" ? (
              <div className="p-5 text-sm text-fg-muted">HEIC photos can’t be previewed in most browsers. Download to view.</div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={doc.title} className="max-h-[52vh] w-full object-contain" />
            )}
          </div>
          {aiSupported && (
            <div className="border-b border-line px-5 py-4">
              {ai.configured && ai.consented ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-fg-muted">Fill in product, price and warranty details from this document.</p>
                    <Button variant="soft" onClick={readWithAi} loading={reading}><Sparkles aria-hidden /> Read with AI</Button>
                  </div>
                  {reading && <p className="text-xs text-fg-muted" role="status">Reading the document — this can take up to a minute.</p>}
                  {aiError && <Notice tone="warning">{aiError}</Notice>}
                </div>
              ) : (
                <p className="flex items-start gap-2 text-sm text-fg-muted">
                  <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {ai.configured ? (
                    <span>AI can read receipts and warranty cards for you. <Link href="/settings" className="font-medium text-accent hover:underline">Turn on AI features</Link> to allow this document to be sent to the AI provider.</span>
                  ) : (
                    <span>AI reading isn’t set up on this server, so enter details yourself. (Administrators: see README → AI features.)</span>
                  )}
                </p>
              )}
            </div>
          )}
          <form
            className="grid gap-4 p-5 sm:grid-cols-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save.run({ id: doc.id, ...meta, assetId: meta.assetId || null });
            }}
          >
            <Field label="Title" htmlFor="dv-title" error={save.fieldErrors.title} className="sm:col-span-2">
              <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="dv-kind">
              <NativeSelect value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })}>
                {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Document date" htmlFor="dv-date" optional>
              <Input type="date" value={meta.documentDate} onChange={(e) => setMeta({ ...meta, documentDate: e.target.value })} />
            </Field>
            <Field label="Linked item" htmlFor="dv-asset" optional className="sm:col-span-2">
              <NativeSelect value={meta.assetId} onChange={(e) => setMeta({ ...meta, assetId: e.target.value })}>
                <option value="">Not linked</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Notes" htmlFor="dv-notes" optional className="sm:col-span-2">
              <Textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} rows={2} />
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" loading={save.pending}>Save details</Button>
              <Button type="button" variant="secondary" onClick={download}><Download aria-hidden /> Download</Button>
              {doc.asset_id && <Button type="button" variant="ghost" asChild><Link href={`/assets/${doc.asset_id}`}>Open item</Link></Button>}
              {canDelete && <Button type="button" variant="danger-ghost" className="ml-auto" onClick={() => setConfirm(true)}><Trash2 aria-hidden /> Delete</Button>}
            </div>
          </form>
          {review && (
            <ExtractionReviewDialog open={!!review} onOpenChange={(o) => !o && setReview(null)} extractionId={review.extractionId} result={review.result} rooms={rooms} linkedAsset={review.linked} currency={currency} />
          )}
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Delete “${doc.title}”?`} description="The file is permanently removed from storage. Linked items and warranties stay, without this document." confirmLabel="Delete document" onConfirm={async () => { const ok = await del.run({ id: doc.id }); if (ok) onClose(); }} />
        </SheetContent>
      )}
    </Sheet>
  );
}
