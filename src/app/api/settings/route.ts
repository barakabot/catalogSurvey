import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/settings
export async function GET() {
  try {
    let settings = await db.settings.findUnique({ where: { id: 'default' } });
    if (!settings) {
      settings = await db.settings.create({
        data: { id: 'default', currencyUnit: 'تومان', adminPassword: 'admin123' },
      });
    }
    // Don't expose the password
    return NextResponse.json({
      currencyUnit: settings.currencyUnit,
      hasPassword: !!settings.adminPassword,
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PUT /api/settings
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { currencyUnit, adminPassword, currentPassword } = body;

    const existing = await db.settings.findUnique({ where: { id: 'default' } });
    if (!existing) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    // If changing password, verify current password
    if (adminPassword && adminPassword !== existing.adminPassword) {
      if (currentPassword !== existing.adminPassword) {
        return NextResponse.json({ error: 'رمز عبور فعلی اشتباه است' }, { status: 401 });
      }
    }

    const data: { currencyUnit?: string; adminPassword?: string } = {};
    if (currencyUnit !== undefined) data.currencyUnit = currencyUnit;
    if (adminPassword !== undefined) data.adminPassword = adminPassword;

    const settings = await db.settings.update({
      where: { id: 'default' },
      data,
    });

    return NextResponse.json({
      currencyUnit: settings.currencyUnit,
      hasPassword: !!settings.adminPassword,
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
