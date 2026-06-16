import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// Convert thumbnail URL to full-size image URL
function thumbToFullUrl(thumbUrl: string): string {
  // thumb: /media/images/thumbs/{hash}_{ext}_[375x375].webp
  // full:  /media/images/{hash}_{ext}.jpg (or .png, .JPG, .PNG, .jpeg, .JPEG)
  const decoded = decodeURIComponent(thumbUrl);
  const withoutThumbs = decoded.replace("/thumbs/", "/");
  // Remove the size suffix like _[375x375].webp or _[375x375].webp
  const withoutSize = withoutThumbs.replace(/_\[\d+x\d+\]\.webp$/i, "");
  // Determine extension from the _ext suffix
  if (withoutSize.endsWith("_jpg")) return withoutSize.replace(/_jpg$/, ".jpg");
  if (withoutSize.endsWith("_png")) return withoutSize.replace(/_png$/, ".png");
  if (withoutSize.endsWith("_JPG")) return withoutSize.replace(/_JPG$/, ".JPG");
  if (withoutSize.endsWith("_PNG")) return withoutSize.replace(/_PNG$/, ".PNG");
  if (withoutSize.endsWith("_jpeg")) return withoutSize.replace(/_jpeg$/, ".jpeg");
  if (withoutSize.endsWith("_JPEG")) return withoutSize.replace(/_JPEG$/, ".JPEG");
  // For Persian-named files without hash_ext pattern, try .jpg
  return withoutSize + ".jpg";
}

// GET /api/scrape-baraka — Scrape product images from barakachocolate.com
export async function GET() {
  try {
    const zai = await ZAI.create();
    const allProducts: { name: string; imageUrl: string; fullImageUrl: string; productUrl: string }[] = [];

    // Scrape all pages (0-7)
    for (let page = 0; page <= 7; page++) {
      const url = page === 0
        ? "https://barakachocolate.com/products/"
        : `https://barakachocolate.com/products/?page=${page}`;

      const result = await zai.functions.invoke("page_reader", { url });
      const html = result.data?.html || "";

      if (!html) continue;

      // Extract product cards with name and image
      const linkNameRegex = /<a[^>]+href=["'](\/products\/[^"?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;

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
          const thumbUrl = "https://barakachocolate.com" + decodeURIComponent(imgMatch[1]);
          const fullImageUrl = thumbToFullUrl(thumbUrl);
          const productUrl = "https://barakachocolate.com" + decodeURIComponent(match[1]);

          allProducts.push({
            name: titleMatch ? titleMatch[1].trim() : productSlug,
            imageUrl: thumbUrl,
            fullImageUrl,
            productUrl,
          });
        }
      }

      // If this page had fewer than 10 products, likely the last page
      const productCount = (html.match(/products--box/g) || []).length;
      if (productCount < 10 && page > 0) break;
    }

    // Deduplicate by imageUrl
    const seen = new Set<string>();
    const unique = allProducts.filter((p) => {
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
