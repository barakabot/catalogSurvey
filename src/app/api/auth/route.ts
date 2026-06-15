import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// POST /api/auth/login
export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    const settings = await db.settings.findUnique({ where: { id: 'default' } });
    if (!settings) {
      return NextResponse.json({ error: 'تنظیمات یافت نشد' }, { status: 500 });
    }

    if (password !== settings.adminPassword) {
      return NextResponse.json({ error: 'رمز عبور اشتباه است' }, { status: 401 });
    }

    // Set a simple session cookie (valid for 24 hours)
    const cookieStore = await cookies();
    cookieStore.set('admin_session', 'authenticated', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json({ error: 'ورود ناموفق بود' }, { status: 500 });
  }
}

// POST /api/auth/logout
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('admin_session');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout failed:', error);
    return NextResponse.json({ error: 'خروج ناموفق بود' }, { status: 500 });
  }
}

// GET /api/auth/check - Check if admin is authenticated
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');
    return NextResponse.json({ authenticated: session?.value === 'authenticated' });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
