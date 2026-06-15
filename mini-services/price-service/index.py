"""
Price Service — Python mini-service for competitor price management.
Port: 3002
Reads/writes the same SQLite database used by the Next.js app.
"""

import os
import re
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from bs4 import BeautifulSoup

# ─── Config ───────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "db", "custom.db")
PORT = 3002

app = FastAPI(title="Price Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ──────────────────────────────────────────────
class CompetitorLinkCreate(BaseModel):
    name: str
    url: str
    linkType: str = "WEBSITE"
    priceSelector: Optional[str] = None
    priceMultiplier: float = 1.0

class CompetitorLinkUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    linkType: Optional[str] = None
    priceSelector: Optional[str] = None
    priceMultiplier: Optional[float] = None


# ─── Database helpers ─────────────────────────────────────────────
async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    return db


# ─── Smart Fetch (handles CDN cookie protection like Digikala) ────
async def smart_fetch(url: str, timeout: int = 15) -> httpx.Response:
    """Fetch URL with manual redirect handling for CDN cookie protection."""
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=timeout,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    ) as client:
        response = await client.get(url)
        
        # Handle redirect with Set-Cookie (CDN protection)
        max_redirects = 5
        redirect_count = 0
        while response.status_code in (301, 302, 303, 307, 308) and redirect_count < max_redirects:
            location = response.headers.get("location", "")
            if not location:
                break
            
            # Build cookies from Set-Cookie headers
            cookies = {}
            for cookie_header in response.headers.get_list("set-cookie"):
                parts = cookie_header.split(";")[0]
                if "=" in parts:
                    key, value = parts.split("=", 1)
                    cookies[key.strip()] = value.strip()
            
            # Follow redirect with cookies
            response = await client.get(
                location,
                cookies=cookies,
            )
            redirect_count += 1
        
        return response


# ─── Price Extraction ─────────────────────────────────────────────
def extract_from_json_path(data: dict, path: str) -> Optional[float]:
    """Extract price from JSON data using dot-notation path (e.g. data.product.price.selling_price)."""
    try:
        current = data
        for key in path.split("."):
            if isinstance(current, dict):
                current = current.get(key)
            elif isinstance(current, list):
                current = current[int(key)]
            else:
                return None
        
        if current is None:
            return None
        
        # Extract number from value
        price = extract_number(current)
        return price
    except Exception:
        return None


def extract_from_css_selector(html: str, selector: str) -> Optional[float]:
    """Extract price from HTML using CSS selector + regex for number extraction."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        elements = soup.select(selector)
        if not elements:
            return None
        
        text = elements[0].get_text(separator=" ", strip=True)
        return extract_number(text)
    except Exception:
        return None


def extract_number(value) -> Optional[float]:
    """Extract a number from various input types."""
    if isinstance(value, (int, float)):
        return float(value)
    
    if isinstance(value, str):
        # Remove common non-numeric characters
        cleaned = re.sub(r'[^\d.]', '', value.replace(',', '').replace('،', ''))
        if cleaned:
            try:
                return float(cleaned)
            except ValueError:
                pass
    
    return None


def find_number_paths(data: dict, target_keys: set = None) -> list:
    """Find paths in JSON that contain numeric values (for error suggestions)."""
    if target_keys is None:
        target_keys = {"price", "selling_price", "amount", "cost", "value", "total"}
    
    results = []
    
    def _search(obj, path=""):
        if isinstance(obj, dict):
            for key, val in obj.items():
                new_path = f"{path}.{key}" if path else key
                if isinstance(val, (int, float)) and key.lower() in target_keys:
                    results.append(new_path)
                elif isinstance(val, (dict, list)):
                    _search(val, new_path)
        elif isinstance(obj, list):
            for i, val in enumerate(obj):
                _search(val, f"{path}[{i}]")
    
    _search(data)
    return results


async def extract_price(url: str, link_type: str, price_selector: Optional[str] = None) -> dict:
    """
    Main price extraction function.
    Returns: {"success": bool, "price": float|null, "error": str|null, "suggestions": list}
    """
    try:
        response = await smart_fetch(url)
        
        if response.status_code != 200:
            return {
                "success": False,
                "price": None,
                "error": f"خطای HTTP: {response.status_code}",
                "suggestions": []
            }
        
        content_type = response.headers.get("content-type", "")
        
        if link_type == "API" or "json" in content_type:
            try:
                data = response.json()
            except Exception:
                return {
                    "success": False,
                    "price": None,
                    "error": "پاسخ API معتبر نیست (JSON نیست)",
                    "suggestions": []
                }
            
            if not price_selector:
                suggestions = find_number_paths(data)
                return {
                    "success": False,
                    "price": None,
                    "error": "مسیر JSON مشخص نشده است",
                    "suggestions": suggestions[:10]
                }
            
            price = extract_from_json_path(data, price_selector)
            if price is not None:
                return {"success": True, "price": price, "error": None, "suggestions": []}
            
            # Try to suggest correct paths
            suggestions = find_number_paths(data)
            return {
                "success": False,
                "price": None,
                "error": f"قیمت در مسیر «{price_selector}» یافت نشد",
                "suggestions": suggestions[:10]
            }
        
        else:  # WEBSITE
            html = response.text
            
            if price_selector:
                price = extract_from_css_selector(html, price_selector)
                if price is not None:
                    return {"success": True, "price": price, "error": None, "suggestions": []}
                return {
                    "success": False,
                    "price": None,
                    "error": f"قیمت با انتخابگر «{price_selector}» یافت نشد",
                    "suggestions": []
                }
            
            # No selector - try common patterns
            soup = BeautifulSoup(html, "html.parser")
            common_selectors = [
                '[class*="price"]', '[class*="Price"]',
                '[data-price]', '[itemprop="price"]',
                '.product-price', '.price', '#price',
            ]
            
            for sel in common_selectors:
                elements = soup.select(sel)
                for el in elements:
                    price = extract_number(el.get_text(strip=True))
                    if price and price > 100:  # Reasonable price threshold
                        return {"success": True, "price": price, "error": None, "suggestions": []}
            
            return {
                "success": False,
                "price": None,
                "error": "قیمت یافت نشد. لطفاً انتخابگر CSS مشخص کنید.",
                "suggestions": []
            }
    
    except httpx.TimeoutException:
        return {"success": False, "price": None, "error": "زمان اتصال به سرور به پایان رسید", "suggestions": []}
    except Exception as e:
        return {"success": False, "price": None, "error": f"خطا: {str(e)}", "suggestions": []}


# ─── API Endpoints ────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "price-service", "port": PORT}


@app.get("/api/products/{product_id}/competitors")
async def get_competitors(product_id: str):
    """Get all competitor links for a product with their prices."""
    db = await get_db()
    try:
        # Check product exists
        cursor = await db.execute("SELECT id, name, price, imageUrl FROM Product WHERE id = ?", (product_id,))
        product = await cursor.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="محصول یافت نشد")
        
        # Get competitor links
        cursor = await db.execute(
            "SELECT * FROM CompetitorLink WHERE productId = ? ORDER BY createdAt DESC",
            (product_id,)
        )
        links = [dict(row) for row in await cursor.fetchall()]
        
        # Get price history for each link
        for link in links:
            cursor = await db.execute(
                "SELECT * FROM PriceHistory WHERE competitorLinkId = ? ORDER BY fetchedAt DESC LIMIT 5",
                (link["id"],)
            )
            link["priceHistory"] = [dict(row) for row in await cursor.fetchall()]
        
        return {
            "product": dict(product),
            "competitors": links,
        }
    finally:
        await db.close()


@app.post("/api/products/{product_id}/competitors")
async def add_competitor(product_id: str, data: CompetitorLinkCreate):
    """Add a new competitor link to a product."""
    db = await get_db()
    try:
        # Check product exists
        cursor = await db.execute("SELECT id FROM Product WHERE id = ?", (product_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="محصول یافت نشد")
        
        now = datetime.now(timezone.utc).isoformat()
        link_id = f"cl_{int(datetime.now().timestamp()*1000)}"
        
        await db.execute(
            """INSERT INTO CompetitorLink (id, productId, name, url, linkType, priceSelector, priceMultiplier, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (link_id, product_id, data.name, data.url, data.linkType, data.priceSelector, data.priceMultiplier, now, now)
        )
        await db.commit()
        
        return {"id": link_id, "message": "لینک رقیب اضافه شد"}
    finally:
        await db.close()


@app.put("/api/competitors/{link_id}")
async def update_competitor(link_id: str, data: CompetitorLinkUpdate):
    """Update a competitor link."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM CompetitorLink WHERE id = ?", (link_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="لینک یافت نشد")
        
        updates = []
        values = []
        for field, value in data.dict(exclude_unset=True).items():
            updates.append(f"{field} = ?")
            values.append(value)
        
        if not updates:
            return {"message": "تغییری اعمال نشد"}
        
        updates.append("updatedAt = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(link_id)
        
        await db.execute(
            f"UPDATE CompetitorLink SET {', '.join(updates)} WHERE id = ?",
            values
        )
        await db.commit()
        
        return {"message": "لینک بروزرسانی شد"}
    finally:
        await db.close()


@app.delete("/api/competitors/{link_id}")
async def delete_competitor(link_id: str):
    """Delete a competitor link and its price history."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM CompetitorLink WHERE id = ?", (link_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="لینک یافت نشد")
        
        await db.execute("DELETE FROM PriceHistory WHERE competitorLinkId = ?", (link_id,))
        await db.execute("DELETE FROM CompetitorLink WHERE id = ?", (link_id,))
        await db.commit()
        
        return {"message": "لینک حذف شد"}
    finally:
        await db.close()


@app.post("/api/products/{product_id}/fetch-prices")
async def fetch_all_prices(product_id: str):
    """Fetch prices from all competitor links for a product."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM CompetitorLink WHERE productId = ?",
            (product_id,)
        )
        links = [dict(row) for row in await cursor.fetchall()]
        
        if not links:
            return {"results": [], "message": "لینک رقیبی وجود ندارد"}
        
        results = []
        for link in links:
            result = await extract_price(link["url"], link["linkType"], link["priceSelector"])
            
            if result["success"]:
                raw_price = result["price"]
                multiplier = link["priceMultiplier"] or 1.0
                adjusted_price = raw_price * multiplier
                now = datetime.now(timezone.utc).isoformat()
                
                # Update link
                await db.execute(
                    """UPDATE CompetitorLink 
                       SET lastPrice = ?, lastAdjustedPrice = ?, lastFetchedAt = ?, updatedAt = ?
                       WHERE id = ?""",
                    (raw_price, adjusted_price, now, now, link["id"])
                )
                
                # Save price history
                history_id = f"ph_{int(datetime.now().timestamp()*1000)}_{link['id'][:8]}"
                await db.execute(
                    """INSERT INTO PriceHistory (id, competitorLinkId, price, adjustedPrice, fetchedAt)
                       VALUES (?, ?, ?, ?, ?)""",
                    (history_id, link["id"], raw_price, adjusted_price, now)
                )
                
                results.append({
                    "linkId": link["id"],
                    "linkName": link["name"],
                    "success": True,
                    "rawPrice": raw_price,
                    "adjustedPrice": adjusted_price,
                })
            else:
                results.append({
                    "linkId": link["id"],
                    "linkName": link["name"],
                    "success": False,
                    "error": result["error"],
                    "suggestions": result.get("suggestions", []),
                })
        
        await db.commit()
        
        success_count = sum(1 for r in results if r["success"])
        fail_count = len(results) - success_count
        
        return {
            "results": results,
            "summary": f"{success_count} موفق{f'، {fail_count} ناموفق' if fail_count > 0 else ''}"
        }
    finally:
        await db.close()


@app.post("/api/competitors/{link_id}/fetch-price")
async def fetch_single_price(link_id: str):
    """Fetch price for a single competitor link."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM CompetitorLink WHERE id = ?", (link_id,))
        link = await cursor.fetchone()
        if not link:
            raise HTTPException(status_code=404, detail="لینک یافت نشد")
        
        link_dict = dict(link)
        result = await extract_price(link_dict["url"], link_dict["linkType"], link_dict["priceSelector"])
        
        if result["success"]:
            raw_price = result["price"]
            multiplier = link_dict["priceMultiplier"] or 1.0
            adjusted_price = raw_price * multiplier
            now = datetime.now(timezone.utc).isoformat()
            
            await db.execute(
                """UPDATE CompetitorLink 
                   SET lastPrice = ?, lastAdjustedPrice = ?, lastFetchedAt = ?, updatedAt = ?
                   WHERE id = ?""",
                (raw_price, adjusted_price, now, now, link_id)
            )
            
            history_id = f"ph_{int(datetime.now().timestamp()*1000)}"
            await db.execute(
                """INSERT INTO PriceHistory (id, competitorLinkId, price, adjustedPrice, fetchedAt)
                   VALUES (?, ?, ?, ?, ?)""",
                (history_id, link_id, raw_price, adjusted_price, now)
            )
            
            await db.commit()
            
            return {
                "success": True,
                "rawPrice": raw_price,
                "adjustedPrice": adjusted_price,
            }
        else:
            return {
                "success": False,
                "error": result["error"],
                "suggestions": result.get("suggestions", []),
            }
    finally:
        await db.close()


# ─── Run ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
