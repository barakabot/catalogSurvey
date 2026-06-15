import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/competitors?catalogProductId=xxx&source=DIGIKALA&unlinked=true
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const catalogProductId = searchParams.get("catalogProductId");
    const source = searchParams.get("source");
    const unlinked = searchParams.get("unlinked") === "true";

    const where: Record<string, unknown> = {};
    if (catalogProductId) where.catalogProductId = catalogProductId;
    if (source) where.source = source.toUpperCase();
    if (unlinked) where.catalogProductId = null;

    const competitors = await db.competitorProduct.findMany({
      where,
      orderBy: { fetchedAt: "desc" },
      include: {
        priceHistory: {
          orderBy: { fetchedAt: "desc" },
          take: 10,
        },
      },
    });

    return NextResponse.json({ competitors, count: competitors.length });
  } catch (error) {
    console.error("Error listing competitors:", error);
    return NextResponse.json({ error: "خطا در دریافت لیست رقبا" }, { status: 500 });
  }
}

// DELETE /api/competitors?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "شناسه الزامی است" }, { status: 400 });

    const existing = await db.competitorProduct.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "محصول رقیب یافت نشد" }, { status: 404 });

    await db.competitorPriceHistory.deleteMany({ where: { competitorProductId: id } });
    await db.competitorProduct.delete({ where: { id } });

    return NextResponse.json({ message: "محصول رقیب حذف شد" });
  } catch (error) {
    console.error("Error deleting competitor:", error);
    return NextResponse.json({ error: "خطا در حذف" }, { status: 500 });
  }
}
