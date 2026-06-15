import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const dbPath = path.join(process.cwd(), 'db', 'custom.db');
    const fileBuffer = await readFile(dbPath);
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': 'attachment; filename="catalog.db"',
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'فایل دیتابیس یافت نشد' }, { status: 404 });
  }
}
