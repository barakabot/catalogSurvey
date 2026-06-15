import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// GET /api/scrape-baraka — Scrape product images from barakachocolate.com
export async function GET() {
  try {
    const zai = await ZAI.create();
    const result = await zai.functions.invoke("page_reader", {
      url: "https://barakachocolate.com/products/",
    });

    const html = result.data?.html || "";
    if (!html) {
      return NextResponse.json({ error: "صفحه باراکا خالی بود" }, { status: 500 });
    }

    // Extract product cards with name and image
    const linkNameRegex = /<a[^>]+href=["'](\/products\/[^"?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const products: { name: string; imageUrl: string; productUrl: string }[] = [];

    while ((match = linkNameRegex.exec(html)) !== null) {
      const inner = match[2];

      // Extract title
      const titleMatch =
        inner.match(/<[^>]+class=["'][^"']*title[^"']*["'][^>]*>([^<]+)/i) ||
        inner.match(/<h[1-6][^>]*>([^<]+)/i) ||
        inner.match(/<span[^>]*>([^<]{3,})<\/span>/i);

      // Extract image (both URL-encoded and non-encoded)
      const imgMatch =
        inner.match(/src=["'](\/media\/images\/thumbs\/[^"']+\[375x375\]\.webp)["']/i) ||
        inner.match(/src=["'](\/media\/images\/thumbs\/[^"']+%5B375x375%5D\.webp)["']/i);

      if (imgMatch) {
        const productSlug = decodeURIComponent(match[1])
          .replace("/products/", "")
          .replace(/\//g, "")
          .replace(/-/g, " ");
        const imageUrl = "https://barakachocolate.com" + decodeURIComponent(imgMatch[1]);
        const productUrl = "https://barakachocolate.com" + decodeURIComponent(match[1]);

        products.push({
          name: titleMatch ? titleMatch[1].trim() : productSlug,
          imageUrl,
          productUrl,
        });
      }
    }

    // Deduplicate by imageUrl
    const seen = new Set<string>();
    const unique = products.filter((p) => {
      if (seen.has(p.imageUrl)) return false;
      seen.add(p.imageUrl);
      return true;
    });

    return NextResponse.json({ products: unique, count: unique.length });
  } catch (error) {
    console.error("Baraka scrape error:", error);
    return NextResponse.json({ error: "خطا در دریافت اطلاعات از سایت باراکا" }, { status: 500 });
  }
}
