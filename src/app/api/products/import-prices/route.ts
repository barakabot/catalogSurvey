import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

// POST /api/products/import-prices — Upload Excel file to update product data
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "فایل اکسل الزامی است" }, { status: 400 });
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "فایل اکسل خالی است" }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ error: "فایل اکسل هیچ ردیفی ندارد" }, { status: 400 });
    }

    // Detect column names (case-insensitive, supports Persian & English)
    const normalize = (s: string) => String(s).trim().toLowerCase().replace(/[\s_-]+/g, "");

    const firstRow = rows[0];
    const columns = Object.keys(firstRow);

    let idCol: string | null = null;
    let nameCol: string | null = null;
    let priceCol: string | null = null;
    let descCol: string | null = null;
    let targetMarketCol: string | null = null;
    let competitiveAdvantageCol: string | null = null;
    let promotionDescCol: string | null = null;
    let marginCol: string | null = null;

    for (const col of columns) {
      const n = normalize(col);
      if (n === "id" || n === "شناسه" || n === "کد" || n === "productid" || n === "کدمحصول") {
        idCol = col;
      } else if (n === "name" || n === "نام" || n === "اسم" || n === "محصول" || n === "ناممحصول" || n === "نامکالا") {
        nameCol = col;
      } else if (n === "price" || n === "قیمت" || n === "بها" || n === "قیمتواحد" || n === "مبلغ") {
        priceCol = col;
      } else if (n === "description" || n === "توضیحات" || n === "مشخصات" || n === "توضیح" || n === "desc" || n === "مشخصاتمحصول") {
        descCol = col;
      } else if (n === "targetmarket" || n === "بازارهدف" || n === "بازار" || n === "target" || n === "بازارهدف") {
        targetMarketCol = col;
      } else if (n === "competitiveadvantage" || n === "مزیت" || n === "مزیترقابتی" || n === "advantage" || n === "مزیترقابتی") {
        competitiveAdvantageCol = col;
      } else if (n === "promotiondescription" || n === "پروموشن" || n === "توضیحاتپروموشن" || n === "promotion" || n === "پروموت") {
        promotionDescCol = col;
      } else if (n === "margin" || n === "مارجین" || n === "حاشیهسود" || n === "حاشیه" || n === "درصدسود") {
        marginCol = col;
      }
    }

    // If price column not found, try to find a numeric column that's not id
    if (!priceCol) {
      for (const col of columns) {
        if (col === idCol || col === nameCol || col === descCol || col === targetMarketCol || col === competitiveAdvantageCol || col === promotionDescCol || col === marginCol) continue;
        const val = firstRow[col];
        if (typeof val === "number" || (!isNaN(Number(val)) && val !== "")) {
          priceCol = col;
          break;
        }
      }
    }

    // At least one updatable field must be present
    if (!priceCol && !descCol && !targetMarketCol && !competitiveAdvantageCol && !promotionDescCol && !marginCol) {
      return NextResponse.json(
        { error: `هیچ ستون قابل بروزرسانی یافت نشد. ستون‌های موجود: ${columns.join(", ")}` },
        { status: 400 }
      );
    }

    if (!idCol && !nameCol) {
      return NextResponse.json(
        { error: `ستون شناسه (id) یا نام محصول (name) یافت نشد. ستون‌های موجود: ${columns.join(", ")}` },
        { status: 400 }
      );
    }

    // Process rows
    const results = {
      updated: 0,
      notFound: [] as string[],
      skipped: [] as string[],
      errors: [] as string[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Parse price if column exists
        let price: number | null = null;
        if (priceCol) {
          const priceVal = row[priceCol];
          price = Number(priceVal);
          if (isNaN(price) || price < 0) {
            results.skipped.push(`ردیف ${i + 2}: قیمت نامعتبر "${priceVal}"`);
            continue;
          }
        }

        // Parse text fields
        const description = descCol ? String(row[descCol] ?? "").trim() : null;
        const targetMarket = targetMarketCol ? String(row[targetMarketCol] ?? "").trim() : null;
        const competitiveAdvantage = competitiveAdvantageCol ? String(row[competitiveAdvantageCol] ?? "").trim() : null;
        const promotionDescription = promotionDescCol ? String(row[promotionDescCol] ?? "").trim() : null;
        const margin = marginCol ? (() => { const v = Number(row[marginCol]); return isNaN(v) ? null : v; })() : null;

        let product;

        // Try to find by ID first
        if (idCol) {
          const id = String(row[idCol]).trim();
          if (id) {
            product = await db.product.findUnique({ where: { id } });
          }
        }

        // Fallback: find by name
        if (!product && nameCol) {
          const name = String(row[nameCol]).trim();
          if (name) {
            product = await db.product.findFirst({ where: { name } });
          }
        }

        if (!product) {
          const identifier = idCol ? String(row[idCol]) : nameCol ? String(row[nameCol]) : `ردیف ${i + 2}`;
          results.notFound.push(String(identifier));
          continue;
        }

        // Build update data — only update fields that exist in the Excel
        const updateData: Record<string, unknown> = {};
        if (price !== null) updateData.price = price;
        if (descCol) updateData.description = description || null;
        if (targetMarketCol) updateData.targetMarket = targetMarket || null;
        if (competitiveAdvantageCol) updateData.competitiveAdvantage = competitiveAdvantage || null;
        if (promotionDescCol) updateData.promotionDescription = promotionDescription || null;
        if (marginCol) updateData.margin = margin !== null ? margin : null;

        await db.product.update({
          where: { id: product.id },
          data: updateData,
        });

        results.updated++;
      } catch (err) {
        results.errors.push(`ردیف ${i + 2}: ${err instanceof Error ? err.message : "خطای ناشناخته"}`);
      }
    }

    return NextResponse.json({
      message: `${results.updated} محصول بروزرسانی شد`,
      total: rows.length,
      updated: results.updated,
      notFound: results.notFound,
      skipped: results.skipped,
      errors: results.errors,
      detectedColumns: { id: idCol, name: nameCol, price: priceCol, description: descCol, targetMarket: targetMarketCol, competitiveAdvantage: competitiveAdvantageCol, promotionDescription: promotionDescCol, margin: marginCol },
    });
  } catch (error) {
    console.error("Excel import error:", error);
    return NextResponse.json(
      { error: "خطا در پردازش فایل اکسل" },
      { status: 500 }
    );
  }
}
