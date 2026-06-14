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
  // Simple CSS selector to regex converter for common patterns
  // Supports: .class, #id, tag, tag.class, tag#id
  const selectorParts = selector.trim();

  // Try to find content in elements matching the selector
  // This is a simplified approach - for production, consider using cheerio
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

    // Strip excessive HTML to reduce token usage
    const cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000); // Limit text length

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
 * Extract price from an API endpoint
 */
export async function extractPriceFromAPI(
  url: string,
  jsonPath: string,
  headers?: Record<string, string>
): Promise<PriceExtractionResult> {
  try {
    const response = await fetch(url, {
      headers: headers || {},
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        success: false,
        price: null,
        method: 'API',
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const price = extractFromJsonPath(data, jsonPath);

    if (price !== null) {
      return { success: true, price, method: 'API' };
    }

    return {
      success: false,
      price: null,
      method: 'API',
      error: 'Could not extract price from JSON path',
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
