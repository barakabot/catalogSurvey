"""
Price Service — Python mini-service for competitor product scraping.
Port: 3002
Scrapes product data from Digikala and SnappShop APIs.
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
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Config ───────────────────────────────────────────────────────
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "db", "custom.db"))
PORT = 3002

app = FastAPI(title="Price Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ──────────────────────────────────────────────
class AddCompetitorRequest(BaseModel):
    source: str  # "DIGIKALA" or "SNAPPSHOP"
    sourceId: str  # Product ID from the source platform

class LinkToCatalogRequest(BaseModel):
    catalogProductId: str  # ID of the catalog product to link

class BulkAddRequest(BaseModel):
    items: list[AddCompetitorRequest]


# ─── Database helpers ─────────────────────────────────────────────
async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    return db


def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    # Convert datetime strings to proper format if needed
    for key, value in d.items():
        if isinstance(value, str) and key.endswith("At"):
            try:
                dt = datetime.fromisoformat(value)
                d[key] = dt.isoformat()
            except (ValueError, TypeError):
                pass
    return d


# ─── Smart Fetch (handles CDN cookie protection like Digikala) ────
async def smart_fetch(url: str, timeout: int = 20) -> httpx.Response:
    """Fetch URL with manual redirect handling for CDN cookie protection."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.digikala.com/",
        "Origin": "https://www.digikala.com",
        "Sec-Ch-Ua": '"Chromium";v="131", "Google Chrome";v="131"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
    }
    
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout,
        headers=headers,
        http2=True,
    ) as client:
        response = await client.get(url)
        return response


async def smart_fetch_manual(url: str, timeout: int = 20) -> httpx.Response:
    """Fetch URL with manual redirect + cookie handling (fallback for CDN protection)."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.digikala.com/",
    }
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=timeout,
        headers=headers,
        http2=True,
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
            response = await client.get(location, cookies=cookies)
            redirect_count += 1
        
        return response


# ─── Digikala Scraper ─────────────────────────────────────────────
async def scrape_digikala(product_id: str) -> dict:
    """Scrape product data from Digikala API."""
    url = f"https://api.digikala.com/v2/product/{product_id}/"
    
    try:
        # Try with auto-redirect first
        response = await smart_fetch(url)
        
        # If that fails, try manual cookie-based redirect
        if response.status_code in (403, 404, 503):
            print(f"[Digikala] Auto-redirect got {response.status_code}, trying manual cookie approach...")
            response = await smart_fetch_manual(url)
        
        if response.status_code != 200:
            # Try one more time with a different approach - simple request
            try:
                async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                    simple_resp = await client.get(url, headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                        "Accept": "*/*",
                    })
                    if simple_resp.status_code == 200:
                        response = simple_resp
            except Exception:
                pass
        
        if response.status_code != 200:
            # Get response body for debugging
            body_preview = ""
            try:
                body_preview = response.text[:500]
            except Exception:
                pass
            return {
                "success": False,
                "error": f"خطای HTTP: {response.status_code} — آیدی محصول درست است؟ (پاسخ: {body_preview[:200]})",
                "data": None
            }
        
        try:
            result = response.json()
        except Exception:
            return {"success": False, "error": "پاسخ API معتبر نیست", "data": None}
        
        product = result.get("data", {}).get("product", {})
        if not product:
            return {"success": False, "error": "محصولی یافت نشد", "data": None}
        
        # Extract product info
        name = product.get("title", "")
        
        # Extract image
        images = product.get("images", {})
        main_image = images.get("main", {})
        image_url = None
        if isinstance(main_image, dict):
            image_url = main_image.get("url", None)
            if not image_url:
                # Try first image from list
                image_list = images.get("list", [])
                if image_list and isinstance(image_list, list):
                    image_url = image_list[0].get("url", None)
        if image_url and not image_url.startswith("http"):
            image_url = f"https://{image_url}" if image_url.startswith("//") else f"https://digikala.com{image_url}"
        
        # Extract price info from default_variant
        default_variant = product.get("default_variant", {})
        price_info = default_variant.get("price", {}) if default_variant else {}
        
        selling_price = price_info.get("selling_price", 0) or 0
        rrp_price = price_info.get("rrp_price", 0) or 0
        discount_percent = price_info.get("discount_percent", 0) or 0
        
        # If no default_variant, try variants
        if not selling_price:
            variants = product.get("variants", [])
            if variants:
                for v in variants:
                    vp = v.get("price", {})
                    sp = vp.get("selling_price", 0)
                    if sp:
                        selling_price = sp
                        rrp_price = vp.get("rrp_price", 0) or 0
                        discount_percent = vp.get("discount_percent", 0) or 0
                        break
        
        # Extract weight/volume from specifications
        weight = None
        volume = None
        specs = product.get("specifications", [])
        for spec_group in specs:
            if isinstance(spec_group, dict):
                attributes = spec_group.get("attributes", [])
                for attr in attributes:
                    if isinstance(attr, dict):
                        title = attr.get("title", "").lower()
                        values = attr.get("values", [])
                        value_str = ", ".join(str(v) for v in values) if values else ""
                        if "وزن" in title:
                            weight = value_str
                        elif "حجم" in title or "ظرفیت" in title:
                            volume = value_str
        
        # Extract brand
        brand_data = product.get("brand", {})
        brand = brand_data.get("title_fa", None) or brand_data.get("title_en", None) if isinstance(brand_data, dict) else None
        
        return {
            "success": True,
            "error": None,
            "data": {
                "source": "DIGIKALA",
                "sourceId": product_id,
                "name": name,
                "imageUrl": image_url,
                "weight": weight,
                "volume": volume,
                "price": selling_price,  # in Rial
                "originalPrice": rrp_price if rrp_price > selling_price else None,
                "discountPercent": discount_percent,
                "brand": brand,
            }
        }
    
    except httpx.TimeoutException:
        return {"success": False, "error": "زمان اتصال به دیجیکالا به پایان رسید", "data": None}
    except Exception as e:
        return {"success": False, "error": f"خطا: {str(e)}", "data": None}


# ─── SnappShop Scraper ────────────────────────────────────────────
async def scrape_snappshop(product_id: str) -> dict:
    """Scrape product data from SnappShop API."""
    url = f"https://apix.snappshop.ir/products/v2/{product_id}"
    
    try:
        # SnappShop needs specific headers
        snapp_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Accept-Language": "fa-IR,fa;q=0.9",
            "Referer": "https://snappshop.com/",
            "Origin": "https://snappshop.com",
        }
        async with httpx.AsyncClient(follow_redirects=True, timeout=20, headers=snapp_headers, http2=True) as client:
            response = await client.get(url)
        
        if response.status_code != 200:
            body_preview = ""
            try:
                body_preview = response.text[:500]
            except Exception:
                pass
            return {
                "success": False,
                "error": f"خطای HTTP اسنپ‌شاپ: {response.status_code} — آیدی محصول درست است؟ (پاسخ: {body_preview[:200]})",
                "data": None
            }
        
        try:
            result = response.json()
        except Exception:
            return {"success": False, "error": "پاسخ API معتبر نیست", "data": None}
        
        data = result.get("data", {})
        if not data:
            return {"success": False, "error": "محصولی یافت نشد", "data": None}
        
        # Extract product info
        content = data.get("content", {})
        name = content.get("title_fa", "")
        
        # Extract image
        images = data.get("images", [])
        image_url = None
        if images and isinstance(images, list):
            image_url = images[0].get("src", None) if isinstance(images[0], dict) else None
        
        # Extract price info from variants
        variants = data.get("variants", [])
        price = 0
        original_price = None
        discount_percent = 0
        
        if variants and isinstance(variants, list):
            variant = variants[0] if variants else {}
            vendors = variant.get("vendor", [])
            if vendors and isinstance(vendors, list):
                vendor = vendors[0] if vendors else {}
                price = vendor.get("price", 0) or 0
                special_price = vendor.get("special_price", 0) or 0
                discount_percent = vendor.get("special_price_percent_discount", 0) or 0
                
                if special_price > 0 and special_price < price:
                    original_price = price
                    price = special_price
                    if discount_percent == 0:
                        discount_percent = round((1 - special_price / price) * 100) if price > 0 else 0
                elif discount_percent > 0:
                    original_price = price
                    price = round(price * (1 - discount_percent / 100))
        
        # Extract weight/volume from attributes
        weight = None
        volume = None
        attributes = data.get("attributes", [])
        if isinstance(attributes, list):
            for attr in attributes:
                if isinstance(attr, dict):
                    title = attr.get("title", "")
                    value = attr.get("value", "")
                    if "وزن" in title:
                        weight = str(value)
                    elif "حجم" in title or "ظرفیت" in title:
                        volume = str(value)
        
        # Extract brand
        brand_data = data.get("brand", {})
        brand = brand_data.get("title_fa", None) if isinstance(brand_data, dict) else None
        
        return {
            "success": True,
            "error": None,
            "data": {
                "source": "SNAPPSHOP",
                "sourceId": product_id,
                "name": name,
                "imageUrl": image_url,
                "weight": weight,
                "volume": volume,
                "price": price,  # in Rial
                "originalPrice": original_price,
                "discountPercent": discount_percent,
                "brand": brand,
            }
        }
    
    except httpx.TimeoutException:
        return {"success": False, "error": "زمان اتصال به اسنپ‌شاپ به پایان رسید", "data": None}
    except Exception as e:
        return {"success": False, "error": f"خطا: {str(e)}", "data": None}


# ─── Save competitor product to DB ────────────────────────────────
async def save_competitor_product(product_data: dict, catalog_product_id: str = None) -> dict:
    """Save or update a competitor product in the database."""
    db = await get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        source = product_data["source"]
        source_id = product_data["sourceId"]
        
        # Check if product already exists (same source + sourceId)
        cursor = await db.execute(
            "SELECT id, price FROM CompetitorProduct WHERE source = ? AND sourceId = ?",
            (source, source_id)
        )
        existing = await cursor.fetchone()
        
        if existing:
            # Update existing product
            existing_id = existing["id"]
            old_price = existing["price"]
            
            await db.execute(
                """UPDATE CompetitorProduct 
                   SET name = ?, imageUrl = ?, weight = ?, volume = ?, price = ?,
                       originalPrice = ?, discountPercent = ?, brand = ?, fetchedAt = ?,
                       catalogProductId = COALESCE(?, catalogProductId), updatedAt = ?
                   WHERE id = ?""",
                (
                    product_data["name"], product_data.get("imageUrl"),
                    product_data.get("weight"), product_data.get("volume"),
                    product_data["price"], product_data.get("originalPrice"),
                    product_data.get("discountPercent", 0), product_data.get("brand"),
                    now, catalog_product_id, now, existing_id
                )
            )
            
            # Save price history if price changed
            if old_price != product_data["price"]:
                history_id = f"cph_{int(datetime.now().timestamp()*1000)}"
                await db.execute(
                    """INSERT INTO CompetitorPriceHistory (id, competitorProductId, price, originalPrice, discountPercent, fetchedAt)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        history_id, existing_id, product_data["price"],
                        product_data.get("originalPrice"), product_data.get("discountPercent", 0), now
                    )
                )
            
            await db.commit()
            return {"success": True, "id": existing_id, "action": "updated"}
        
        else:
            # Create new product
            import uuid
            new_id = f"cp_{uuid.uuid4().hex[:20]}"
            
            await db.execute(
                """INSERT INTO CompetitorProduct 
                   (id, source, sourceId, name, imageUrl, weight, volume, price, originalPrice,
                    discountPercent, brand, fetchedAt, catalogProductId, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    new_id, source, source_id, product_data["name"],
                    product_data.get("imageUrl"), product_data.get("weight"),
                    product_data.get("volume"), product_data["price"],
                    product_data.get("originalPrice"), product_data.get("discountPercent", 0),
                    product_data.get("brand"), now, catalog_product_id, now, now
                )
            )
            
            # Save initial price history
            history_id = f"cph_{int(datetime.now().timestamp()*1000)}"
            await db.execute(
                """INSERT INTO CompetitorPriceHistory (id, competitorProductId, price, originalPrice, discountPercent, fetchedAt)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    history_id, new_id, product_data["price"],
                    product_data.get("originalPrice"), product_data.get("discountPercent", 0), now
                )
            )
            
            await db.commit()
            return {"success": True, "id": new_id, "action": "created"}
    
    except Exception as e:
        await db.rollback()
        raise e
    finally:
        await db.close()


# ─── API Endpoints ────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "price-service", "version": "2.0", "port": PORT}


@app.get("/api/test-scrape")
async def test_scrape(source: str = Query(...), sourceId: str = Query(...)):
    """Test scrape endpoint — returns raw API response for debugging."""
    source_upper = source.upper()
    if source_upper not in ("DIGIKALA", "SNAPPSHOP"):
        raise HTTPException(status_code=400, detail="منبع باید DIGIKALA یا SNAPPSHOP باشد")
    
    if source_upper == "DIGIKALA":
        url = f"https://api.digikala.com/v2/product/{sourceId}/"
    else:
        url = f"https://apix.snappshop.ir/products/v2/{sourceId}"
    
    # Try 3 methods and return all results
    results = {}
    
    # Method 1: auto-redirect with full headers
    try:
        resp = await smart_fetch(url)
        results["method1_auto_redirect"] = {
            "status": resp.status_code,
            "headers": dict(resp.headers)[:20] if resp.headers else {},
            "body_preview": resp.text[:300] if resp.text else "",
        }
    except Exception as e:
        results["method1_auto_redirect"] = {"error": str(e)}
    
    # Method 2: manual cookie redirect
    try:
        resp = await smart_fetch_manual(url)
        results["method2_manual_cookie"] = {
            "status": resp.status_code,
            "body_preview": resp.text[:300] if resp.text else "",
        }
    except Exception as e:
        results["method2_manual_cookie"] = {"error": str(e)}
    
    # Method 3: simple request
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
            results["method3_simple"] = {
                "status": resp.status_code,
                "body_preview": resp.text[:300] if resp.text else "",
            }
    except Exception as e:
        results["method3_simple"] = {"error": str(e)}
    
    return {"url": url, "results": results}


@app.post("/api/competitors/scrape")
async def scrape_and_add(req: AddCompetitorRequest):
    """Scrape a product from Digikala or SnappShop and save to database."""
    source = req.source.upper()
    if source not in ("DIGIKALA", "SNAPPSHOP"):
        raise HTTPException(status_code=400, detail="منبع باید DIGIKALA یا SNAPPSHOP باشد")
    
    if not req.sourceId:
        raise HTTPException(status_code=400, detail="شناسه محصول الزامی است")
    
    if source == "DIGIKALA":
        result = await scrape_digikala(req.sourceId)
    else:
        result = await scrape_snappshop(req.sourceId)
    
    if not result["success"]:
        raise HTTPException(status_code=422, detail=result["error"])
    
    save_result = await save_competitor_product(result["data"])
    
    return {
        "message": "محصول رقیب با موفقیت ذخیره شد" if save_result["action"] == "created" else "محصول رقیب بروزرسانی شد",
        "id": save_result["id"],
        "action": save_result["action"],
        "data": result["data"],
    }


@app.post("/api/competitors/scrape-preview")
async def scrape_preview(req: AddCompetitorRequest):
    """Preview what would be scraped without saving."""
    source = req.source.upper()
    if source not in ("DIGIKALA", "SNAPPSHOP"):
        raise HTTPException(status_code=400, detail="منبع باید DIGIKALA یا SNAPPSHOP باشد")
    
    if not req.sourceId:
        raise HTTPException(status_code=400, detail="شناسه محصول الزامی است")
    
    if source == "DIGIKALA":
        result = await scrape_digikala(req.sourceId)
    else:
        result = await scrape_snappshop(req.sourceId)
    
    if not result["success"]:
        raise HTTPException(status_code=422, detail=result["error"])
    
    return {"data": result["data"]}


@app.get("/api/competitors")
async def list_competitors(
    catalogProductId: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    unlinked: Optional[bool] = Query(False),
):
    """List competitor products, optionally filtered."""
    db = await get_db()
    try:
        conditions = []
        params = []
        
        if catalogProductId:
            conditions.append("catalogProductId = ?")
            params.append(catalogProductId)
        
        if source:
            conditions.append("source = ?")
            params.append(source.upper())
        
        if unlinked:
            conditions.append("catalogProductId IS NULL")
        
        where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        
        cursor = await db.execute(
            f"SELECT * FROM CompetitorProduct{where} ORDER BY fetchedAt DESC",
            params
        )
        competitors = [row_to_dict(row) for row in await cursor.fetchall()]
        
        return {"competitors": competitors, "count": len(competitors)}
    finally:
        await db.close()


@app.get("/api/competitors/{competitor_id}")
async def get_competitor(competitor_id: str):
    """Get a single competitor product with price history."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM CompetitorProduct WHERE id = ?",
            (competitor_id,)
        )
        competitor = await cursor.fetchone()
        if not competitor:
            raise HTTPException(status_code=404, detail="محصول رقیب یافت نشد")
        
        result = row_to_dict(competitor)
        
        # Get price history
        cursor = await db.execute(
            "SELECT * FROM CompetitorPriceHistory WHERE competitorProductId = ? ORDER BY fetchedAt DESC LIMIT 20",
            (competitor_id,)
        )
        result["priceHistory"] = [row_to_dict(row) for row in await cursor.fetchall()]
        
        return result
    finally:
        await db.close()


@app.put("/api/competitors/{competitor_id}/link")
async def link_to_catalog(competitor_id: str, req: LinkToCatalogRequest):
    """Link a competitor product to a catalog product."""
    db = await get_db()
    try:
        # Check competitor exists
        cursor = await db.execute("SELECT id FROM CompetitorProduct WHERE id = ?", (competitor_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="محصول رقیب یافت نشد")
        
        # Check catalog product exists
        cursor = await db.execute("SELECT id FROM Product WHERE id = ?", (req.catalogProductId,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="محصول کاتالوگ یافت نشد")
        
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "UPDATE CompetitorProduct SET catalogProductId = ?, updatedAt = ? WHERE id = ?",
            (req.catalogProductId, now, competitor_id)
        )
        await db.commit()
        
        return {"message": "محصول رقیب به محصول کاتالوگ متصل شد"}
    finally:
        await db.close()


@app.put("/api/competitors/{competitor_id}/unlink")
async def unlink_from_catalog(competitor_id: str):
    """Unlink a competitor product from its catalog product."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM CompetitorProduct WHERE id = ?", (competitor_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="محصول رقیب یافت نشد")
        
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "UPDATE CompetitorProduct SET catalogProductId = NULL, updatedAt = ? WHERE id = ?",
            (now, competitor_id)
        )
        await db.commit()
        
        return {"message": "اتصال محصول رقیب لغو شد"}
    finally:
        await db.close()


@app.post("/api/competitors/{competitor_id}/refresh")
async def refresh_competitor(competitor_id: str):
    """Re-scrape and update a competitor product's price."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT source, sourceId FROM CompetitorProduct WHERE id = ?", (competitor_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="محصول رقیب یافت نشد")
        
        source = row["source"]
        source_id = row["sourceId"]
    finally:
        await db.close()
    
    if source == "DIGIKALA":
        result = await scrape_digikala(source_id)
    else:
        result = await scrape_snappshop(source_id)
    
    if not result["success"]:
        raise HTTPException(status_code=422, detail=result["error"])
    
    save_result = await save_competitor_product(result["data"])
    
    return {
        "message": "قیمت بروزرسانی شد",
        "data": result["data"],
        "action": save_result["action"],
    }


@app.post("/api/competitors/refresh-all")
async def refresh_all_competitors():
    """Re-scrape all competitor products."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id, source, sourceId FROM CompetitorProduct")
        competitors = [row_to_dict(row) for row in await cursor.fetchall()]
    finally:
        await db.close()
    
    results = {"success": 0, "failed": 0, "details": []}
    
    for comp in competitors:
        try:
            if comp["source"] == "DIGIKALA":
                result = await scrape_digikala(comp["sourceId"])
            else:
                result = await scrape_snappshop(comp["sourceId"])
            
            if result["success"]:
                await save_competitor_product(result["data"])
                results["success"] += 1
                results["details"].append({"id": comp["id"], "name": result["data"]["name"], "status": "success"})
            else:
                results["failed"] += 1
                results["details"].append({"id": comp["id"], "error": result["error"], "status": "failed"})
        except Exception as e:
            results["failed"] += 1
            results["details"].append({"id": comp["id"], "error": str(e), "status": "failed"})
    
    return results


@app.delete("/api/competitors/{competitor_id}")
async def delete_competitor(competitor_id: str):
    """Delete a competitor product and its price history."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM CompetitorProduct WHERE id = ?", (competitor_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="محصول رقیب یافت نشد")
        
        await db.execute("DELETE FROM CompetitorPriceHistory WHERE competitorProductId = ?", (competitor_id,))
        await db.execute("DELETE FROM CompetitorProduct WHERE id = ?", (competitor_id,))
        await db.commit()
        
        return {"message": "محصول رقیب حذف شد"}
    finally:
        await db.close()


@app.get("/api/products/{product_id}/competitors")
async def get_product_competitors(product_id: str):
    """Get all competitor products linked to a catalog product."""
    db = await get_db()
    try:
        # Check product exists
        cursor = await db.execute(
            "SELECT id, name, price, imageUrl FROM Product WHERE id = ?",
            (product_id,)
        )
        product = await cursor.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="محصول کاتالوگ یافت نشد")
        
        # Get competitor products
        cursor = await db.execute(
            "SELECT * FROM CompetitorProduct WHERE catalogProductId = ? ORDER BY fetchedAt DESC",
            (product_id,)
        )
        competitors = [row_to_dict(row) for row in await cursor.fetchall()]
        
        # Get price history for each competitor
        for comp in competitors:
            cursor = await db.execute(
                "SELECT * FROM CompetitorPriceHistory WHERE competitorProductId = ? ORDER BY fetchedAt DESC LIMIT 10",
                (comp["id"],)
            )
            comp["priceHistory"] = [row_to_dict(row) for row in await cursor.fetchall()]
        
        return {
            "product": row_to_dict(product),
            "competitors": competitors,
        }
    finally:
        await db.close()


# ─── Run ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
