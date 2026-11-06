import { NextResponse, type NextRequest } from "next/server";
import { readLocalSigned } from "@/lib/storage";

/**
 * Serves locally stored documents for a short-lived signed token (local
 * storage mode only — with Supabase, signed URLs point at Supabase Storage).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Not found", { status: 404 });
  try {
    const { bytes, contentType, downloadName } = await readLocalSigned(token);
    const safeName = downloadName?.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": safeName ? `attachment; filename="${safeName}"` : "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return new NextResponse("This link has expired. Reopen the document in Habitat.", { status: 403 });
  }
}
