import ZAI from 'z-ai-web-dev-sdk';

/**
 * Extract price from a JSON API response using a JSON path
 * e.g., "data.price" or "result.items[0].price"
 */
function extractFromJsonPath(data: unknown, path: string): number | null {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = data;

  for (const key of keys) {
    if (current === null || current === undefined) return null;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return null;
    }
  }

  if (typeof current === 'number') return current;
  if (typeof current === 'string') {
    const num = parseFloat(current.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Extract price from HTML content using a CSS selector
 * This uses regex-based matching since we don't have a DOM parser on the server
 */
function extractFromCssSelector(html: string, selector: string): number | null {
  const selectorParts = selector.trim();

  const classMatch = selectorParts.match(/^\.([\w-]+)/);
  const idMatch = selectorParts.match(/^#([\w-]+)/);
  const tagClassMatch = selectorParts.match(/^(\w+)\.([\w-]+)/);

  let pattern: RegExp | null = null;

  if (tagClassMatch) {
    const [, tag, cls] = tagClassMatch;
    pattern = new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([^<]+)<`, 'i');
  } else if (classMatch) {
    const cls = classMatch[1];
    pattern = new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([^<]+)<`, 'i');
  } else if (idMatch) {
    const id = idMatch[1];
    pattern = new RegExp(`id=["']${id}["'][^>]*>([^<]+)<`, 'i');
  }

  if (pattern) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const num = parseFloat(match[1].replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? null : num;
    }
  }

  return null;
}

/**
 * Use LLM to extract price from HTML content
 */
async function extractWithLLM(html: string, productName: string): Promise<number | null> {
  try {
    const zai = await ZAI.create();

    const cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: 'You are a price extraction assistant. Extract the product price from the given webpage text. Return ONLY the numeric price value without any currency symbol, unit, or extra text. If you cannot find a price, return "NOT_FOUND".'
        },
        {
          role: 'user',
          content: `Product name: "${productName}"\n\nWebpage text:\n${cleanText}\n\nExtract the price of this product. Return ONLY the number.`
        }
      ],
      thinking: { type: 'disabled' }
    });

    const response = completion.choices[0]?.message?.content?.trim();

    if (response && response !== 'NOT_FOUND') {
      const num = parseFloat(response.replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? null : num;
    }
    return null;
  } catch (error) {
    console.error('LLM price extraction failed:', error);
    return null;
  }
}

export interface PriceExtractionResult {
  success: boolean;
  price: number | null;
  method: string;
  error?: string;
}

/**
 * Smart fetch with CDN cookie handling.
 * Some APIs (like Digikala) use CDN protection that:
 * 1. First request returns 307 with a Set-Cookie header
 * 2. Second request (with cookie) returns the actual data
 */
async function smartFetch(url: string, options?: RequestInit): Promise<Response> {
  const defaultHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
  };

  const mergedOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options?.headers as Record<string, string> || {}),
    },
    redirect: 'manual', // Don't auto-follow redirects so we can capture cookies
    signal: options?.signal || AbortSignal.timeout(20000),
  };

  // First request
  let response = await fetch(url, mergedOptions);

  // If redirect (307/302/301), capture cookies and follow manually
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    const setCookies = response.headers.getSetCookie?.() || [];

    if (location) {
      // Build cookie string from Set-Cookie headers
      const cookies = setCookies
        .map((c: string) => c.split(';')[0])
        .join('; ');

      const redirectOptions: RequestInit = {
        ...mergedOptions,
        headers: {
          ...(mergedOptions.headers as Record<string, string>),
          ...(cookies ? { 'Cookie': cookies } : {}),
        },
        redirect: 'follow', // Allow auto-follow for subsequent requests
      };

      response = await fetch(location, redirectOptions);
    }
  }

  // If still not OK, try once more with redirect: follow (some CDNs need multiple rounds)
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (location) {
      response = await fetch(location, {
        ...mergedOptions,
        redirect: 'follow',
      });
    }
  }

  return response;
}

/**
 * Extract price from an API endpoint
 * Handles CDN cookie protection (e.g., Digikala)
 */
export async function extractPriceFromAPI(
  url: string,
  jsonPath: string,
): Promise<PriceExtractionResult> {
  try {
    const response = await smartFetch(url);

    if (!response.ok) {
      return {
        success: false,
        price: null,
        method: 'API',
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';

    // Check if response is actually JSON
    if (!contentType.includes('json') && !contentType.includes('text/')) {
      return {
        success: false,
        price: null,
        method: 'API',
        error: `پاسخ API از نوع JSON نیست (${contentType}). ممکن است نیاز به احراز هویت یا دور زدن حفاظت CDN باشد.`,
      };
    }

    let data: unknown;
    try {
      const text = await response.text();
      data = JSON.parse(text);
    } catch {
      return {
        success: false,
        price: null,
        method: 'API',
        error: 'پاسخ API قابل پردازش به عنوان JSON نیست. ممکن است صفحه HTML بازگردانده شده باشد.',
      };
    }

    const price = extractFromJsonPath(data, jsonPath);

    if (price !== null) {
      return { success: true, price, method: 'API' };
    }

    // Try to give a helpful error about what fields are available
    const dataObj = data as Record<string, unknown>;
    const availablePaths = findNumberPaths(dataObj, '', 3);

    return {
      success: false,
      price: null,
      method: 'API',
      error: `مسیر JSON "${jsonPath}" پیدا نشد. مسیرهای عددی موجود: ${availablePaths.slice(0, 5).join('، ') || 'یافت نشد'}`,
    };
  } catch (error) {
    return {
      success: false,
      price: null,
      method: 'API',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Find paths to number values in a JSON object (for helpful error messages)
 */
function findNumberPaths(obj: unknown, prefix: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth || !obj || typeof obj !== 'object') return [];

  const paths: string[] = [];
  const entries = Object.entries(obj as Record<string, unknown>);

  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number' && value > 100) {
      // Likely a price if > 100
      paths.push(path);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      paths.push(...findNumberPaths(value, path, maxDepth, depth + 1));
    }
  }

  return paths;
}

/**
 * Extract price from a website URL
 * If cssSelector is provided, use it; otherwise use LLM
 */
export async function extractPriceFromWebsite(
  url: string,
  productName: string,
  cssSelector?: string
): Promise<PriceExtractionResult> {
  try {
    const zai = await ZAI.create();
    const result = await zai.functions.invoke('page_reader', { url });

    if (!result?.data?.html) {
      return {
        success: false,
        price: null,
        method: 'Website',
        error: 'Could not fetch page content',
      };
    }

    const html = result.data.html;

    // If CSS selector is provided, try that first
    if (cssSelector) {
      const price = extractFromCssSelector(html, cssSelector);
      if (price !== null) {
        return { success: true, price, method: 'CSS Selector' };
      }
    }

    // Fall back to LLM extraction
    const price = await extractWithLLM(html, productName);
    if (price !== null) {
      return { success: true, price, method: 'LLM' };
    }

    return {
      success: false,
      price: null,
      method: cssSelector ? 'CSS Selector + LLM' : 'LLM',
      error: 'Could not extract price from website',
    };
  } catch (error) {
    return {
      success: false,
      price: null,
      method: 'Website',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Main price extraction function - routes to API or Website extraction
 */
export async function extractPrice(
  url: string,
  linkType: string,
  productName: string,
  priceSelector?: string
): Promise<PriceExtractionResult> {
  if (linkType === 'API') {
    if (!priceSelector) {
      return {
        success: false,
        price: null,
        method: 'API',
        error: 'JSON path is required for API links',
      };
    }
    return extractPriceFromAPI(url, priceSelector);
  } else {
    return extractPriceFromWebsite(url, productName, priceSelector || undefined);
  }
}
