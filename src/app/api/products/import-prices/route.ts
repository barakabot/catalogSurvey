import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

// POST /api/products/import-prices — Upload Excel file to update product prices
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

    for (const col of columns) {
      const n = normalize(col);
      if (n === "id" || n === "شناسه" || n === "کد" || n === "productid" || n === "کدمحصول") {
        idCol = col;
      } else if (n === "name" || n === "نام" || n === "اسم" || n === "محصول" || n === "ناممحصول" || n === "نامکالا") {
        nameCol = col;
      } else if (n === "price" || n === "قیمت" || n === "بها" || n === "قیمتواحد" || n === "مبلغ") {
        priceCol = col;
      }
    }

    // If price column not found, try to find a numeric column that's not id
    if (!priceCol) {
      for (const col of columns) {
        if (col === idCol || col === nameCol) continue;
        const val = firstRow[col];
        if (typeof val === "number" || (!isNaN(Number(val)) && val !== "")) {
          priceCol = col;
          break;
        }
      }
    }

    if (!priceCol) {
      return NextResponse.json(
        { error: `ستون قیمت یافت نشد. ستون‌های موجود: ${columns.join(", ")}` },
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
        const priceVal = row[priceCol!];
        const price = Number(priceVal);
        if (isNaN(price) || price < 0) {
          results.skipped.push(`ردیف ${i + 2}: قیمت نامعتبر "${priceVal}"`);
          continue;
        }

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

        // Update price
        await db.product.update({
          where: { id: product.id },
          data: { price },
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
      detectedColumns: { id: idCol, name: nameCol, price: priceCol },
    });
  } catch (error) {
    console.error("Excel import error:", error);
    return NextResponse.json(
      { error: "خطا در پردازش فایل اکسل" },
      { status: 500 }
    );
  }
}
