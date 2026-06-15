import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/competitors/[competitorId]/link
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ competitorId: string }> }
) {
  try {
    const { competitorId } = await params;
    const body = await req.json();
    const { catalogProductId } = body;

    if (!catalogProductId) {
      return NextResponse.json({ error: "شناسه محصول کاتالوگ الزامی است" }, { status: 400 });
    }

    const competitor = await db.competitorProduct.findUnique({ where: { id: competitorId } });
    if (!competitor) {
      return NextResponse.json({ error: "محصول رقیب یافت نشد" }, { status: 404 });
    }

    const product = await db.product.findUnique({ where: { id: catalogProductId } });
    if (!product) {
      return NextResponse.json({ error: "محصول کاتالوگ یافت نشد" }, { status: 404 });
    }

    await db.competitorProduct.update({
      where: { id: competitorId },
      data: { catalogProductId },
    });

    return NextResponse.json({ message: "محصول رقیب به محصول کاتالوگ متصل شد" });
  } catch (error) {
    console.error("Error linking competitor:", error);
    return NextResponse.json({ error: "خطا در اتصال" }, { status: 500 });
  }
}
