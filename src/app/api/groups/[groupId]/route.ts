import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// PUT /api/groups/[groupId] - Update a group
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const { name, order } = await request.json();

    const group = await db.productGroup.update({
      where: { id: groupId },
      data: {
        ...(name !== undefined && { name }),
        ...(order !== undefined && { order }),
      },
      include: {
        children: { orderBy: { order: 'asc' } },
      },
    });

    return NextResponse.json(group);
  } catch (error) {
    console.error('Failed to update group:', error);
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    await db.productGroup.delete({ where: { id: groupId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete group:', error);
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 });
  }
}
