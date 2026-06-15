import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── Smart Fetch with CDN cookie protection ─────────────────────
async function smartFetch(url: string, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    let response = await fetch(url, {
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    let redirectCount = 0;
    while ([301, 302, 303, 307, 308].includes(response.status) && redirectCount < 5) {
      const location = response.headers.get("location");
      if (!location) break;

      const cookies: string[] = [];
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          cookies.push(value.split(";")[0]);
        }
      });

      const redirectHeaders: Record<string, string> = {
        ...headers,
        ...(cookies.length > 0 ? { Cookie: cookies.join("; ") } : {}),
      };

      response = await fetch(location, {
        headers: redirectHeaders,
        redirect: "manual",
        signal: controller.signal,
      });
      redirectCount++;
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeDigikala(productId: string) {
  try {
    const url = `https://api.digikala.com/v2/product/${productId}`;
    const response = await smartFetch(url);
    if (response.status !== 200) return { success: false, error: `خطای HTTP: ${response.status}` };

    const result = await response.json();
    const product = result?.data?.product;
    if (!product) return { success: false, error: "محصولی یافت نشد" };

    const name = product.title || "";
    let imageUrl: string | null = null;
    if (product.images?.main?.url) imageUrl = product.images.main.url;
    else if (product.images?.list?.[0]?.url) imageUrl = product.images.list[0].url;
    if (imageUrl && !imageUrl.startsWith("http")) imageUrl = imageUrl.startsWith("//") ? `https:${imageUrl}` : `https://digikala.com${imageUrl}`;

    let sellingPrice = 0, rrpPrice = 0, discountPercent = 0;
    const dv = product.default_variant;
    if (dv?.price) { sellingPrice = dv.price.selling_price || 0; rrpPrice = dv.price.rrp_price || 0; discountPercent = dv.price.discount_percent || 0; }
    if (!sellingPrice && product.variants?.length) { for (const v of product.variants) { if (v.price?.selling_price) { sellingPrice = v.price.selling_price; rrpPrice = v.price.rrp_price || 0; discountPercent = v.price.discount_percent || 0; break; } } }

    let weight: string | null = null, volume: string | null = null;
    for (const sg of product.specifications || []) { for (const a of sg?.attributes || []) { const t = (a.title || "").toLowerCase(); const v = (a.values || []).join(", "); if (t.includes("وزن")) weight = v; if (t.includes("حجم") || t.includes("ظرفیت")) volume = v; } }
    const brand = product.brand?.title_fa || product.brand?.title_en || null;

    return { success: true, data: { source: "DIGIKALA", sourceId: productId, name, imageUrl, weight, volume, price: sellingPrice, originalPrice: rrpPrice > sellingPrice ? rrpPrice : null, discountPercent, brand } };
  } catch (e) { const m = e instanceof Error ? e.message : ""; return { success: false, error: m.includes("abort") ? "زمان اتصال به پایان رسید" : `خطا: ${m}` }; }
}

async function scrapeSnappshop(productId: string) {
  try {
    const url = `https://apix.snappshop.ir/products/v2/${productId}`;
    const response = await smartFetch(url);
    if (response.status !== 200) return { success: false, error: `خطای HTTP: ${response.status}` };

    const result = await response.json();
    const data = result?.data;
    if (!data) return { success: false, error: "محصولی یافت نشد" };

    const name = data.content?.title_fa || "";
    let imageUrl: string | null = data.images?.[0]?.src || null;
    let price = 0, originalPrice: number | null = null, discountPercent = 0;
    if (data.variants?.length) { const v = data.variants[0]; const vendors = v.vendor || []; if (vendors.length) { const vn = vendors[0]; price = vn.price || 0; const sp = vn.special_price || 0; if (sp > 0 && sp < price) { originalPrice = price; price = sp; discountPercent = vn.special_price_percent_discount || 0; if (!discountPercent && price > 0) discountPercent = Math.round((1 - sp / (originalPrice || price)) * 100); } else { discountPercent = vn.special_price_percent_discount || 0; if (discountPercent > 0) { originalPrice = price; price = Math.round(price * (1 - discountPercent / 100)); } } } }

    let weight: string | null = null, volume: string | null = null;
    for (const a of data.attributes || []) { const t = a.title || "", v = a.value || ""; if (t.includes("وزن")) weight = String(v); if (t.includes("حجم") || t.includes("ظرفیت")) volume = String(v); }
    const brand = data.brand?.title_fa || null;

    return { success: true, data: { source: "SNAPPSHOP", sourceId: productId, name, imageUrl, weight, volume, price, originalPrice, discountPercent, brand } };
  } catch (e) { const m = e instanceof Error ? e.message : ""; return { success: false, error: m.includes("abort") ? "زمان اتصال به پایان رسید" : `خطا: ${m}` }; }
}

// POST /api/competitors/[competitorId]/refresh
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitorId: string }> }
) {
  try {
    const { competitorId } = await params;

    const competitor = await db.competitorProduct.findUnique({ where: { id: competitorId } });
    if (!competitor) {
      return NextResponse.json({ error: "محصول رقیب یافت نشد" }, { status: 404 });
    }

    let result;
    if (competitor.source === "DIGIKALA") {
      result = await scrapeDigikala(competitor.sourceId);
    } else {
      result = await scrapeSnappshop(competitor.sourceId);
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    const oldPrice = competitor.price;
    const newData = result.data!;

    await db.competitorProduct.update({
      where: { id: competitorId },
      data: {
        name: newData.name,
        imageUrl: newData.imageUrl,
        weight: newData.weight,
        volume: newData.volume,
        price: newData.price,
        originalPrice: newData.originalPrice,
        discountPercent: newData.discountPercent,
        brand: newData.brand,
        fetchedAt: new Date(),
      },
    });

    if (oldPrice !== newData.price) {
      await db.competitorPriceHistory.create({
        data: {
          competitorProductId: competitorId,
          price: newData.price,
          originalPrice: newData.originalPrice,
          discountPercent: newData.discountPercent,
        },
      });
    }

    return NextResponse.json({
      message: "قیمت بروزرسانی شد",
      data: newData,
      priceChanged: oldPrice !== newData.price,
    });
  } catch (error) {
    console.error("Error refreshing competitor:", error);
    return NextResponse.json({ error: "خطا در بروزرسانی" }, { status: 500 });
  }
}
