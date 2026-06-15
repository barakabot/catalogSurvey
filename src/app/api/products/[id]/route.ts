import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/products/[id] - Get a single product
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        competitorProducts: {
          orderBy: { fetchedAt: 'desc' },
          include: {
            priceHistory: {
              orderBy: { fetchedAt: 'desc' },
              take: 10,
            },
          },
        },
        group: {
          include: { parent: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Failed to fetch product:', error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// PUT /api/products/[id] - Update a product
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, price, imageUrl, groupId, targetMarket, competitiveAdvantage, promotionDescription, margin } = body;

    const product = await db.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(String(price)) }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(groupId !== undefined && { groupId: groupId || null }),
        ...(targetMarket !== undefined && { targetMarket: targetMarket || null }),
        ...(competitiveAdvantage !== undefined && { competitiveAdvantage: competitiveAdvantage || null }),
        ...(promotionDescription !== undefined && { promotionDescription: promotionDescription || null }),
        ...(margin !== undefined && { margin: margin !== null && margin !== '' ? parseFloat(String(margin)) : null }),
      },
      include: {
        competitorProducts: true,
        group: { include: { parent: true } },
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('Failed to update product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// DELETE /api/products/[id] - Delete a product
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete product:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
