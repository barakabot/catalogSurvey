import { db } from '@/lib/db';
import { NextResponse, NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

// POST /api/products/images - Upload an image for a product
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const productId = formData.get('productId') as string | null;
    const imageUrl = formData.get('imageUrl') as string | null; // External URL option
    const alt = formData.get('alt') as string | null;

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Check product exists
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let image_url = '';

    if (file) {
      // Handle file upload
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Ensure upload directory exists
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');
      await mkdir(uploadDir, { recursive: true });

      // Generate unique filename
      const ext = path.extname(file.name) || '.jpg';
      const filename = `${randomUUID()}${ext}`;
      const filePath = path.join(uploadDir, filename);

      // Write file
      await writeFile(filePath, buffer);
      image_url = `/uploads/products/${filename}`;
    } else if (imageUrl) {
      // Handle external URL
      image_url = imageUrl;
    } else {
      return NextResponse.json({ error: 'Either file or imageUrl is required' }, { status: 400 });
    }

    // Get current max order for this product
    const existingImages = await db.productImage.findMany({
      where: { productId },
      orderBy: { order: 'desc' },
      take: 1,
    });
    const nextOrder = existingImages.length > 0 ? existingImages[0].order + 1 : 0;

    // Create image record
    const image = await db.productImage.create({
      data: {
        url: image_url,
        alt: alt || null,
        order: nextOrder,
        productId,
      },
    });

    // Also update the product's imageUrl to the first image if it's null
    if (!product.imageUrl) {
      await db.product.update({
        where: { id: productId },
        data: { imageUrl: image_url },
      });
    }

    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    console.error('Failed to upload image:', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
