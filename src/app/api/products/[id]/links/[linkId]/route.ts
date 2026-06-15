import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// PUT /api/products/[id]/links/[linkId] - Update a competitor link
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const { linkId } = await params;
    const body = await request.json();
    const { name, url, linkType, priceSelector } = body;

    const link = await db.competitorLink.update({
      where: { id: linkId },
      data: {
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url }),
        ...(linkType !== undefined && { linkType }),
        ...(priceSelector !== undefined && { priceSelector }),
      },
    });

    return NextResponse.json(link);
  } catch (error) {
    console.error('Failed to update link:', error);
    return NextResponse.json({ error: 'Failed to update link' }, { status: 500 });
  }
}

// DELETE /api/products/[id]/links/[linkId] - Delete a competitor link
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const { linkId } = await params;
    await db.competitorLink.delete({ where: { id: linkId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete link:', error);
    return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 });
  }
}
