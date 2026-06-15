import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── Smart Fetch with CDN cookie protection ─────────────────────
async function smartFetch(url: string, timeout = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "application/json, text/html, */*",
      "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Ch-Ua": '"Chromium";v="131", "Google Chrome";v="131"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
    };

    // First try: auto-redirect (follow redirects normally)
    try {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.ok) return response;
    } catch {
      // ignore, try manual approach
    }

    // Second try: manual redirect with cookie handling
    const manualHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "application/json, text/html, */*",
      "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: url.includes("digikala") ? "https://www.digikala.com/" : "https://snappshop.com/",
    };

    let response = await fetch(url, {
      headers: manualHeaders,
      redirect: "manual",
      signal: controller.signal,
    });

    // Handle redirect with Set-Cookie (CDN protection like Digikala)
    let redirectCount = 0;
    while ([301, 302, 303, 307, 308].includes(response.status) && redirectCount < 5) {
      const location = response.headers.get("location");
      if (!location) break;

      // Extract cookies from Set-Cookie headers
      const cookies: string[] = [];
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          const cookiePart = value.split(";")[0];
          cookies.push(cookiePart);
        }
      });

      const redirectHeaders: Record<string, string> = {
        ...manualHeaders,
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

// ─── Digikala Scraper ──────────────────────────────────────────
async function scrapeDigikala(productId: string): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}> {
  try {
    const url = `https://api.digikala.com/v2/product/${productId}`;
    const response = await smartFetch(url);

    if (response.status !== 200) {
      let bodyPreview = "";
      try { bodyPreview = await response.text(); bodyPreview = bodyPreview.slice(0, 200); } catch {}
      return { success: false, error: `خطای HTTP دیجیکالا: ${response.status} — آیدی محصول درست است؟ (پاسخ: ${bodyPreview})` };
    }

    const result = await response.json();
    const product = result?.data?.product;
    if (!product) {
      return { success: false, error: "محصولی یافت نشد" };
    }

    // Extract name
    const name = product.title || "";

    // Extract image
    let imageUrl: string | null = null;
    const images = product.images;
    if (images?.main?.url) {
      imageUrl = images.main.url;
    } else if (images?.list?.[0]?.url) {
      imageUrl = images.list[0].url;
    }
    if (imageUrl && !imageUrl.startsWith("http")) {
      imageUrl = imageUrl.startsWith("//")
        ? `https:${imageUrl}`
        : `https://digikala.com${imageUrl}`;
    }

    // Extract price from default_variant
    let sellingPrice = 0;
    let rrpPrice = 0;
    let discountPercent = 0;

    const defaultVariant = product.default_variant;
    if (defaultVariant?.price) {
      sellingPrice = defaultVariant.price.selling_price || 0;
      rrpPrice = defaultVariant.price.rrp_price || 0;
      discountPercent = defaultVariant.price.discount_percent || 0;
    }

    // Fallback: try variants
    if (!sellingPrice && product.variants?.length) {
      for (const v of product.variants) {
        if (v.price?.selling_price) {
          sellingPrice = v.price.selling_price;
          rrpPrice = v.price.rrp_price || 0;
          discountPercent = v.price.discount_percent || 0;
          break;
        }
      }
    }

    // Extract weight/volume from specifications
    let weight: string | null = null;
    let volume: string | null = null;
    const specs = product.specifications || [];
    for (const specGroup of specs) {
      if (specGroup?.attributes) {
        for (const attr of specGroup.attributes) {
          const title = (attr.title || "").toLowerCase();
          const values = attr.values || [];
          const valueStr = values.join(", ");
          if (title.includes("وزن")) weight = valueStr;
          if (title.includes("حجم") || title.includes("ظرفیت")) volume = valueStr;
        }
      }
    }

    // Extract brand
    const brand = product.brand?.title_fa || product.brand?.title_en || null;

    return {
      success: true,
      data: {
        source: "DIGIKALA",
        sourceId: productId,
        name,
        imageUrl,
        weight,
        volume,
        price: sellingPrice,
        originalPrice: rrpPrice > sellingPrice ? rrpPrice : null,
        discountPercent,
        brand,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    return { success: false, error: msg.includes("abort") ? "زمان اتصال به دیجیکالا به پایان رسید" : `خطا: ${msg}` };
  }
}

// ─── SnappShop Scraper ─────────────────────────────────────────
async function scrapeSnappshop(productId: string): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}> {
  try {
    const url = `https://apix.snappshop.ir/products/v2/${productId}`;
    const response = await smartFetch(url);

    if (response.status !== 200) {
      let bodyPreview = "";
      try { bodyPreview = await response.text(); bodyPreview = bodyPreview.slice(0, 200); } catch {}
      return { success: false, error: `خطای HTTP اسنپ‌شاپ: ${response.status} — آیدی محصول درست است؟ (پاسخ: ${bodyPreview})` };
    }

    const result = await response.json();
    const data = result?.data;
    if (!data) {
      return { success: false, error: "محصولی یافت نشد" };
    }

    // Extract name
    const name = data.content?.title_fa || "";

    // Extract image
    let imageUrl: string | null = null;
    if (data.images?.[0]?.src) {
      imageUrl = data.images[0].src;
    }

    // Extract price from variants
    let price = 0;
    let originalPrice: number | null = null;
    let discountPercent = 0;

    if (data.variants?.length) {
      const variant = data.variants[0];
      const vendors = variant.vendor || [];
      if (vendors.length) {
        const vendor = vendors[0];
        price = vendor.price || 0;
        const specialPrice = vendor.special_price || 0;

        if (specialPrice > 0 && specialPrice < price) {
          originalPrice = price;
          price = specialPrice;
          discountPercent = vendor.special_price_percent_discount || 0;
          if (discountPercent === 0 && price > 0) {
            discountPercent = Math.round((1 - specialPrice / (originalPrice || price)) * 100);
          }
        } else {
          discountPercent = vendor.special_price_percent_discount || 0;
          if (discountPercent > 0) {
            originalPrice = price;
            price = Math.round(price * (1 - discountPercent / 100));
          }
        }
      }
    }

    // Extract weight/volume from attributes
    let weight: string | null = null;
    let volume: string | null = null;
    const attributes = data.attributes || [];
    for (const attr of attributes) {
      const title = attr.title || "";
      const value = attr.value || "";
      if (title.includes("وزن")) weight = String(value);
      if (title.includes("حجم") || title.includes("ظرفیت")) volume = String(value);
    }

    // Extract brand
    const brand = data.brand?.title_fa || null;

    return {
      success: true,
      data: {
        source: "SNAPPSHOP",
        sourceId: productId,
        name,
        imageUrl,
        weight,
        volume,
        price,
        originalPrice,
        discountPercent,
        brand,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "خطای ناشناخته";
    return { success: false, error: msg.includes("abort") ? "زمان اتصال به اسنپ‌شاپ به پایان رسید" : `خطا: ${msg}` };
  }
}

// ─── Save competitor product ───────────────────────────────────
async function saveCompetitorProduct(
  productData: Record<string, unknown>,
  catalogProductId?: string | null
): Promise<{ id: string; action: string }> {
  const source = productData.source as string;
  const sourceId = productData.sourceId as string;

  // Check if product already exists
  const existing = await db.competitorProduct.findFirst({
    where: { source, sourceId },
  });

  if (existing) {
    // Update existing product
    const oldPrice = existing.price;
    await db.competitorProduct.update({
      where: { id: existing.id },
      data: {
        name: productData.name as string,
        imageUrl: productData.imageUrl as string | null,
        weight: productData.weight as string | null,
        volume: productData.volume as string | null,
        price: productData.price as number,
        originalPrice: productData.originalPrice as number | null,
        discountPercent: productData.discountPercent as number,
        brand: productData.brand as string | null,
        fetchedAt: new Date(),
        ...(catalogProductId ? { catalogProductId } : {}),
      },
    });

    // Save price history if price changed
    if (oldPrice !== (productData.price as number)) {
      await db.competitorPriceHistory.create({
        data: {
          competitorProductId: existing.id,
          price: productData.price as number,
          originalPrice: productData.originalPrice as number | null,
          discountPercent: productData.discountPercent as number,
        },
      });
    }

    return { id: existing.id, action: "updated" };
  } else {
    // Create new product
    const newProduct = await db.competitorProduct.create({
      data: {
        source,
        sourceId,
        name: productData.name as string,
        imageUrl: productData.imageUrl as string | null,
        weight: productData.weight as string | null,
        volume: productData.volume as string | null,
        price: productData.price as number,
        originalPrice: productData.originalPrice as number | null,
        discountPercent: productData.discountPercent as number,
        brand: productData.brand as string | null,
        fetchedAt: new Date(),
        catalogProductId: catalogProductId || null,
      },
    });

    // Save initial price history
    await db.competitorPriceHistory.create({
      data: {
        competitorProductId: newProduct.id,
        price: productData.price as number,
        originalPrice: productData.originalPrice as number | null,
        discountPercent: productData.discountPercent as number,
      },
    });

    return { id: newProduct.id, action: "created" };
  }
}

// POST /api/competitors/scrape - Scrape and save
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source, sourceId, catalogProductId } = body;

    if (!source || !sourceId) {
      return NextResponse.json(
        { error: "منبع و شناسه محصول الزامی است" },
        { status: 400 }
      );
    }

    const sourceUpper = source.toUpperCase();
    if (!["DIGIKALA", "SNAPPSHOP"].includes(sourceUpper)) {
      return NextResponse.json(
        { error: "منبع باید DIGIKALA یا SNAPPSHOP باشد" },
        { status: 400 }
      );
    }

    let result;
    if (sourceUpper === "DIGIKALA") {
      result = await scrapeDigikala(sourceId);
    } else {
      result = await scrapeSnappshop(sourceId);
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    const saveResult = await saveCompetitorProduct(result.data!, catalogProductId || null);

    return NextResponse.json({
      message:
        saveResult.action === "created"
          ? "محصول رقیب با موفقیت ذخیره شد"
          : "محصول رقیب بروزرسانی شد",
      id: saveResult.id,
      action: saveResult.action,
      data: result.data,
    });
  } catch (error) {
    console.error("Error scraping:", error);
    return NextResponse.json({ error: "خطا در اسکرپ محصول" }, { status: 500 });
  }
}
