import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/competitors/[competitorId]/unlink
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ competitorId: string }> }
) {
  try {
    const { competitorId } = await params;

    const competitor = await db.competitorProduct.findUnique({ where: { id: competitorId } });
    if (!competitor) {
      return NextResponse.json({ error: "محصول رقیب یافت نشد" }, { status: 404 });
    }

    await db.competitorProduct.update({
      where: { id: competitorId },
      data: { catalogProductId: null },
    });

    return NextResponse.json({ message: "اتصال محصول رقیب لغو شد" });
  } catch (error) {
    console.error("Error unlinking competitor:", error);
    return NextResponse.json({ error: "خطا در لغو اتصال" }, { status: 500 });
  }
}
