import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/products - List all products with their links
export async function GET() {
  try {
    const products = await db.product.findMany({
      include: {
        links: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(products);
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// POST /api/products - Create a new product
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, price, imageUrl, category } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: 'Name and price are required' }, { status: 400 });
    }

    const product = await db.product.create({
      data: {
        name,
        description: description || null,
        price: parseFloat(String(price)),
        imageUrl: imageUrl || null,
        category: category || null,
      },
      include: {
        links: true,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Failed to create product:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
