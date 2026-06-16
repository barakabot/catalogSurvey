import { db } from '@/lib/db';
import { NextResponse, NextRequest } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';

// DELETE /api/products/images/[imageId] - Delete a product image
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;

    const image = await db.productImage.findUnique({
      where: { id: imageId },
      include: { product: true },
    });

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Delete file from filesystem if it's a local upload
    if (image.url.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), 'public', image.url);
      try {
        await unlink(filePath);
      } catch {
        // File might not exist, continue with DB deletion
      }
    }

    // Delete from database
    await db.productImage.delete({ where: { id: imageId } });

    // If this was the product's main imageUrl, update it to the next available image
    if (image.product.imageUrl === image.url) {
      const remainingImages = await db.productImage.findMany({
        where: { productId: image.productId },
        orderBy: { order: 'asc' },
        take: 1,
      });
      await db.product.update({
        where: { id: image.productId },
        data: { imageUrl: remainingImages.length > 0 ? remainingImages[0].url : null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}

// PUT /api/products/images/[imageId] - Update image order or alt
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const body = await request.json();
    const { order, alt } = body;

    const image = await db.productImage.update({
      where: { id: imageId },
      data: {
        ...(order !== undefined && { order }),
        ...(alt !== undefined && { alt }),
      },
    });

    return NextResponse.json(image);
  } catch (error) {
    console.error('Failed to update image:', error);
    return NextResponse.json({ error: 'Failed to update image' }, { status: 500 });
  }
}
