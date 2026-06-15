import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/products/[id]/links
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const links = await db.competitorLink.findMany({
      where: { productId: id },
      include: {
        priceHistory: {
          orderBy: { fetchedAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(links);
  } catch (error) {
    console.error('Failed to fetch links:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

// POST /api/products/[id]/links
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, url, linkType, priceSelector, priceMultiplier } = body;

    if (!name || !url) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
    }

    const product = await db.product.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const link = await db.competitorLink.create({
      data: {
        productId: id,
        name,
        url,
        linkType: linkType || 'WEBSITE',
        priceSelector: priceSelector || null,
        priceMultiplier: priceMultiplier ? parseFloat(String(priceMultiplier)) : 1.0,
      },
    });

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error('Failed to create link:', error);
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }
}
