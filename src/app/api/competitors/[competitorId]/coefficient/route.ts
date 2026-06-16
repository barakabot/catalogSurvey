import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/competitors/[competitorId]/coefficient - Update coefficient
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ competitorId: string }> }
) {
  try {
    const { competitorId } = await params;
    const body = await req.json();
    const { coefficient } = body;

    if (coefficient === undefined || coefficient === null) {
      return NextResponse.json({ error: "ضریب الزامی است" }, { status: 400 });
    }

    const numCoefficient = parseFloat(String(coefficient));
    if (isNaN(numCoefficient) || numCoefficient < 0) {
      return NextResponse.json({ error: "ضریب باید عدد مثبت باشد" }, { status: 400 });
    }

    const competitor = await db.competitorProduct.findUnique({
      where: { id: competitorId },
    });

    if (!competitor) {
      return NextResponse.json({ error: "محصول رقیب یافت نشد" }, { status: 404 });
    }

    const updated = await db.competitorProduct.update({
      where: { id: competitorId },
      data: { coefficient: numCoefficient },
    });

    return NextResponse.json({
      message: "ضریب بروزرسانی شد",
      coefficient: updated.coefficient,
      adjustedPrice: Math.round(updated.price * updated.coefficient),
    });
  } catch (error) {
    console.error("Error updating coefficient:", error);
    return NextResponse.json({ error: "خطا در بروزرسانی ضریب" }, { status: 500 });
  }
}
