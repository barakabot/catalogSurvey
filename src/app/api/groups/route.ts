import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/groups - List all groups with hierarchy
export async function GET() {
  try {
    const groups = await db.productGroup.findMany({
      include: {
        children: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { products: true },
        },
      },
      where: { parentId: null },
      orderBy: { order: 'asc' },
    });

    // Also get subgroups count
    const result = groups.map((g) => ({
      ...g,
      productCount: g._count.products,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch groups:', error);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
}

// POST /api/groups - Create a new group
export async function POST(request: Request) {
  try {
    const { name, parentId, order } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'نام گروه الزامی است' }, { status: 400 });
    }

    // If parentId is provided, verify it exists and is a main group
    if (parentId) {
      const parent = await db.productGroup.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ error: 'گروه والد یافت نشد' }, { status: 404 });
      }
      if (parent.parentId) {
        return NextResponse.json({ error: 'نمی‌توان زیرگروهِ زیرگروه ساخت' }, { status: 400 });
      }
    }

    // Get max order for this level
    const maxOrder = await db.productGroup.aggregate({
      where: { parentId: parentId || null },
      _max: { order: true },
    });

    const group = await db.productGroup.create({
      data: {
        name,
        parentId: parentId || null,
        order: order ?? (maxOrder._max.order ?? -1) + 1,
      },
      include: {
        children: { orderBy: { order: 'asc' } },
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error('Failed to create group:', error);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}
