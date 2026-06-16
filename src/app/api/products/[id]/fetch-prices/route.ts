import { db } from '@/lib/db';
import { extractPrice } from '@/lib/price-extractor';
import { NextResponse } from 'next/server';

// POST /api/products/[id]/fetch-prices
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: { links: true },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.links.length === 0) {
      return NextResponse.json({ error: 'No competitor links found' }, { status: 400 });
    }

    const results = [];

    for (const link of product.links) {
      const extractionResult = await extractPrice(
        link.url,
        link.linkType,
        product.name,
        link.priceSelector || undefined
      );

      if (extractionResult.success && extractionResult.price !== null) {
        const adjustedPrice = extractionResult.price * link.priceMultiplier;

        // Update the link with the new prices
        await db.competitorLink.update({
          where: { id: link.id },
          data: {
            lastPrice: extractionResult.price,
            lastAdjustedPrice: adjustedPrice,
            lastFetchedAt: new Date(),
          },
        });

        // Save to price history
        await db.priceHistory.create({
          data: {
            competitorLinkId: link.id,
            price: extractionResult.price,
            adjustedPrice: adjustedPrice,
          },
        });

        results.push({
          linkId: link.id,
          linkName: link.name,
          success: true,
          rawPrice: extractionResult.price,
          multiplier: link.priceMultiplier,
          adjustedPrice: adjustedPrice,
          method: extractionResult.method,
        });
      } else {
        results.push({
          linkId: link.id,
          linkName: link.name,
          success: false,
          rawPrice: null,
          multiplier: link.priceMultiplier,
          adjustedPrice: null,
          method: extractionResult.method,
          error: extractionResult.error,
        });
      }
    }

    // Return updated product with links
    const updatedProduct = await db.product.findUnique({
      where: { id },
      include: {
        links: {
          include: {
            priceHistory: {
              orderBy: { fetchedAt: 'desc' },
              take: 5,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        group: { include: { parent: true } },
      },
    });

    return NextResponse.json({
      product: updatedProduct,
      results,
    });
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
