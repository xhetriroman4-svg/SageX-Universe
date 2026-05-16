import { NextRequest, NextResponse } from "next/server";

const isBlockedHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(normalized)) return true;
  return (
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
};

/* ═══════════════════════════════════════════════════════════════
   ROBUST WEB PROXY v2 — Fixed CSS/JS loading, no base href,
   proper URL resolution, MutationObserver for dynamic resources
   ═══════════════════════════════════════════════════════════════ */

const FETCH_TIMEOUT = 20000; // 20s timeout

function buildProxyUrl(url: string, adblock: boolean, dark: boolean) {
  return `/api/proxy?url=${encodeURIComponent(url)}${adblock ? "&adblock=true" : ""}${dark ? "&dark=true" : ""}&_t=${Date.now()}`;
}

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function errorPageHtml(title: string, message: string, originalUrl: string, adblock: boolean, dark: boolean) {
  const safeTitle = escapeHtml(title);
  const safeMsg = escapeHtml(message);
  const safeUrl = escapeHtml(originalUrl);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
  .error-card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px; max-width: 500px; text-align: center; }
  .error-icon { font-size: 4rem; margin-bottom: 16px; }
  .error-title { font-size: 1.5rem; font-weight: 600; margin-bottom: 12px; color: #ff6b6b; }
  .error-msg { font-size: 0.95rem; color: #aaa; margin-bottom: 8px; line-height: 1.5; }
  .error-url { font-size: 0.8rem; color: #666; word-break: break-all; margin-bottom: 24px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 8px; }
  .btn { display: inline-block; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 0.9rem; font-weight: 500; cursor: pointer; border: none; margin: 4px; }
  .btn-primary { background: #00f2ff; color: #000; }
  .btn-secondary { background: rgba(255,255,255,0.1); color: #e0e0e0; }
</style></head><body>
<div class="error-card">
  <div class="error-icon">&#127760;</div>
  <div class="error-title">${safeTitle}</div>
  <div class="error-msg">${safeMsg}</div>
  <div class="error-url">${safeUrl}</div>
  <div>
    <a class="btn btn-primary" href="${buildProxyUrl(originalUrl, adblock, dark)}">Retry</a>
    <a class="btn btn-secondary" href="${originalUrl}" target="_blank" rel="noopener">Open Directly</a>
  </div>
</div>
<script>
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'sagex-page-error', url: "${escapeHtml(originalUrl)}", title: "${safeTitle}" }, '*');
  }
</script>
</body></html>`;
}

async function handleProxy(request: NextRequest, method: string) {
  const targetUrl = request.nextUrl.searchParams.get("url");
  const adblock = request.nextUrl.searchParams.get("adblock") === "true";
  const dark = request.nextUrl.searchParams.get("dark") === "true";

  if (!targetUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const urlObj = new URL(targetUrl);
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return NextResponse.json({ error: "Only HTTP(S) URLs are supported" }, { status: 400 });
    }
    if (isBlockedHostname(urlObj.hostname)) {
      return new NextResponse(
        errorPageHtml("Access Denied", "This address is not allowed through the proxy for security reasons.", targetUrl, adblock, dark),
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    /* ── Build forwarded headers ── */
    const headersToForward: Record<string, string> = {
      "User-Agent":
        request.headers.get("user-agent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: request.headers.get("accept") || "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": request.headers.get("accept-language") || "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      Referer: urlObj.origin + "/",
      Origin: urlObj.origin,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    };

    if (request.headers.get("cookie")) headersToForward["cookie"] = request.headers.get("cookie")!;
    if (request.headers.get("content-type"))
      headersToForward["content-type"] = request.headers.get("content-type")!;
    if (request.headers.get("authorization"))
      headersToForward["authorization"] = request.headers.get("authorization")!;

    /* ── Fetch with timeout ── */
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const fetchOptions: RequestInit = {
      method,
      headers: headersToForward,
      redirect: "manual",
      signal: controller.signal,
    };

    if (!["GET", "HEAD"].includes(method)) {
      fetchOptions.body = await request.arrayBuffer();
    }

    let response: Response;
    try {
      response = await fetch(targetUrl, fetchOptions);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        return new NextResponse(
          errorPageHtml("Connection Timed Out", "The website took too long to respond. It might be down or blocking proxy requests.", targetUrl, adblock, dark),
          { status: 504, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
      return new NextResponse(
        errorPageHtml("Connection Failed", `Could not reach the website: ${fetchError.message || "Unknown error"}`, targetUrl, adblock, dark),
        { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    clearTimeout(timeoutId);

    /* ── Handle redirects (follow up to 10 server-side) ── */
    let redirectCount = 0;
    let currentUrl = targetUrl;
    while (response.status >= 300 && response.status < 400 && redirectCount < 10) {
      const location = response.headers.get("location");
      if (!location) break;
      const absoluteLocation = new URL(location, currentUrl).href;
      const redirHeaders: Record<string, string> = {
        "User-Agent": headersToForward["User-Agent"],
        Accept: headersToForward.Accept,
        "Accept-Language": headersToForward["Accept-Language"],
        "Accept-Encoding": "identity",
        Referer: currentUrl,
      };
      try {
        const redirController = new AbortController();
        const redirTimeout = setTimeout(() => redirController.abort(), FETCH_TIMEOUT);
        response = await fetch(absoluteLocation, { method: "GET", headers: redirHeaders, redirect: "manual", signal: redirController.signal });
        clearTimeout(redirTimeout);
        currentUrl = absoluteLocation;
        redirectCount++;
      } catch {
        break;
      }
    }

    // If we still have a redirect after 10 hops, send it as a client redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const absoluteLocation = new URL(location, currentUrl).href;
        const redirUrl = buildProxyUrl(absoluteLocation, adblock, dark);
        return NextResponse.redirect(new URL(redirUrl, request.url));
      }
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.arrayBuffer();

    /* ── Build response headers — strip security headers that block framing ── */
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        ![
          "x-frame-options",
          "content-security-policy",
          "content-security-policy-report-only",
          "transfer-encoding",
          "content-encoding",
          "strict-transport-security",
          "access-control-allow-origin",
          "access-control-allow-credentials",
          "access-control-allow-methods",
          "access-control-allow-headers",
          "set-cookie",
          "public-key-pins",
          "public-key-pins-report-only",
          "cross-origin-opener-policy",
          "cross-origin-embedder-policy",
          "cross-origin-resource-policy",
          "cache-control",
          "vary",
          "etag",
          "last-modified",
          "age",
        ].includes(lowerKey)
      ) {
        responseHeaders.set(key, value);
      }
    });
    // Allow everything from our proxy
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    // CRITICAL: Prevent Netlify CDN from caching proxy responses
    // Without this, Netlify returns the same cached response for ALL URLs
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    responseHeaders.set("Pragma", "no-cache");
    responseHeaders.set("Expires", "0");
    responseHeaders.set("Vary", "*");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    responseHeaders.delete("content-encoding");

    /* ── Rewrite Set-Cookie ── */
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      let newCookie = cookie
        .replace(/Domain=[^;]+;?/gi, "")
        .replace(/SameSite=[^;]+;?/gi, "SameSite=Lax;")
        .replace(/Secure;?/gi, "");
      if (!/Path=/i.test(newCookie)) {
        newCookie += "; Path=/";
      }
      responseHeaders.append("Set-Cookie", newCookie);
    }

    /* ── Helper: check if a URL should be proxied ── */
    const shouldProxy = (url: string): boolean => {
      if (!url || url.length < 2) return false;
      if (url.startsWith("data:")) return false;
      if (url.startsWith("javascript:")) return false;
      if (url.startsWith("blob:")) return false;
      if (url.startsWith("about:")) return false;
      if (url.startsWith("#")) return false;
      if (url.startsWith("mailto:")) return false;
      if (url.startsWith("tel:")) return false;
      // Skip custom protocols used by JS frameworks (click:, close:, input:, etc.)
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("http:") && !url.startsWith("https:") && !url.startsWith("/")) return false;
      // Skip already-proxied URLs
      if (url.includes("/api/proxy?url=")) return false;
      return true;
    };

    /* ── Helper: rewrite a URL to go through proxy ── */
    const rewriteUrl = (url: string): string => {
      if (!shouldProxy(url)) return url;
      try {
        const absoluteUrl = new URL(url, currentUrl).href;
        return buildProxyUrl(absoluteUrl, adblock, dark);
      } catch {
        return url;
      }
    };

    /* ══════════════════════════════════════
       HTML — full rewrite + injection
       ══════════════════════════════════════ */
    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      let html = new TextDecoder().decode(body);

      // ── CRITICAL: Remove any existing <base> tags ──
      // Existing <base> tags would break our proxy URL resolution
      html = html.replace(/<base[^>]*>/gi, "");

      // ── Rewrite <meta http-equiv="refresh"> ──
      html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?(\d+;\s*url=)([^"'>]+)["']?[^>]*>/gi,
        (_m, prefix, url) => {
          return `<meta http-equiv="refresh" content="${prefix}${rewriteUrl(url.trim())}">`;
        }
      );

      // ── Rewrite HTML tag attributes ──
      html = html.replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)(\s*\/?)>/g, (_m, tagName, attrs, closing) => {
        let newAttrs = attrs;
        // Match URL attributes preceded by whitespace
        newAttrs = newAttrs.replace(/(\s)(src|href|action|poster|data-src|data-bg|data-lazy-src|data-original)=["']([^"']+)["']/gi, (_attrMatch, ws, attrName, url) => {
          if (!shouldProxy(url)) return _attrMatch;
          return `${ws}${attrName}="${rewriteUrl(url)}"`;
        });
        // Handle unquoted attributes (valid HTML but less common)
        newAttrs = newAttrs.replace(/(\s)(src|href|action)=([^\s>"']+)/gi, (_attrMatch, ws, attrName, url) => {
          if (!shouldProxy(url)) return _attrMatch;
          return `${ws}${attrName}="${rewriteUrl(url)}"`;
        });
        // Handle srcset (comma-separated URLs)
        newAttrs = newAttrs.replace(/(\s)(srcset)=["']([^"']+)["']/gi, (_attrMatch, ws, attrName, srcset) => {
          const newSrcset = srcset
            .split(",")
            .map((entry: string) => {
              const parts = entry.trim().split(/\s+/);
              if (parts[0] && shouldProxy(parts[0])) {
                parts[0] = rewriteUrl(parts[0]);
              }
              return parts.join(" ");
            })
            .join(", ");
          return `${ws}${attrName}="${newSrcset}"`;
        });
        return `<${tagName}${newAttrs}${closing}>`;
      });

      // ── Rewrite inline <style> url() references ──
      html = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs, cssContent) => {
        const rewritten = cssContent.replace(/url\(\s*["']?([^"'\)]+)["']?\s*\)/gi, (urlMatch: string, url: string) => {
          if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("#") || url.includes("/api/proxy?url=")) return urlMatch;
          try {
            const absoluteUrl = new URL(url, currentUrl).href;
            return `url("${buildProxyUrl(absoluteUrl, adblock, dark)}")`;
          } catch {
            return urlMatch;
          }
        });
        return `<style${attrs}>${rewritten}</style>`;
      });

      // ── AdBlock ──
      if (adblock) {
        html = html.replace(
          /<script[^>]*src=["'][^"']*(doubleclick|google-analytics|googlesyndication|googleadservices|googletagmanager|popads|adsense|amazon-adsystem|facebook\.net.*plugin|connect\.facebook|analytics\.tiktok|clarity\.ms|hotjar|cdn\.amplitude|segment\.io|optimizely|chartbeat|newrelic|nr-data|mixpanel|heap\.io|fullstory|mouseflow|crazyegg|quantserve|scorecardresearch|outbrain|taboola|criteo|adnxs|rubiconproject|pubmatic|openx|casalemedia|indexww|moatads|sharethis|addthis|disqus)[^"']*["'][^>]*><\/script>/gi,
          ""
        );
        html = html.replace(
          /<iframe[^>]*src=["'][^"']*(doubleclick|googlesyndication|ads|adserver|ad\.|adservice|amazon-adsystem|taboola|outbrain)[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi,
          ""
        );
        html = html.replace(
          /<div[^>]*(class|id)=["'][^"']*(ad[_-]?container|ad[_-]?wrapper|ad[_-]?slot|advertisement|sponsor|promo[_-]?box|google[_-]?ad|taboola|outbrain)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
          ""
        );
        html = html.replace(
          /<noscript[^>]*>[\s\S]*?(doubleclick|googlesyndication|adsense|facebook\.net)[\s\S]*?<\/noscript>/gi,
          ""
        );
      }

      /* ── AdBlock CSS ── */
      const adBlockCSS = adblock
        ? `<style>
          .ad, .ads, .ad-container, .ad-wrapper, .ad-slot, .advertisement, .ad-banner,
          .sponsor, .promoted, .promo-box, .google-ad, .ad-wrapper, .ad-placement,
          [id^="ad-"], [class^="ad-"], [id*="AdSlot"], [class*="AdSlot"],
          [id*="banner-ad"], [class*="banner-ad"],
          [id*="google_ad"], [class*="google_ad"],
          [id*="AdContainer"], [class*="AdContainer"],
          [id*="taboola"], [class*="taboola"],
          [id*="outbrain"], [class*="outbrain"],
          iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
          div[class*="AdSlot"], div[id*="AdSlot"],
          [data-ad], [data-ad-slot], [data-adunit], [data-ad-client],
          .sidebar-ad, .in-article-ad, .in-feed-ad, .native-ad, .mid-article-ad,
          #ads, #ad, #ad1, #ad2, .commercial-unit, .teaser-ad,
          [class*="__ad__"], [id*="__ad__"],
          .ytp-ad-module, .video-ads, .ytp-ad-overlay-container { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; pointer-events: none !important; }
        </style>`
        : "";

      /* ── Dark Mode CSS ── */
      const darkModeCSS = dark
        ? `<style>
          html { background: #1a1a2e !important; }
          body { background: #1a1a2e !important; color: #e0e0e0 !important; }
          :root { --color-bg: #1a1a2e; --color-text: #e0e0e0; }
          div, section, main, article, aside, header, footer, nav, span, p, ul, ol, li, dl, dd, dt, figure, figcaption, details, summary { background-color: rgba(26,26,46,0.85) !important; color: #e0e0e0 !important; border-color: #333 !important; }
          h1, h2, h3, h4, h5, h6 { color: #fff !important; }
          a { color: #66b3ff !important; }
          a:visited { color: #b388ff !important; }
          img, video, canvas, svg, iframe, embed, object { background-color: transparent !important; }
          input, textarea, select, button { background: #2a2a3e !important; color: #e0e0e0 !important; border: 1px solid #444 !important; }
          pre, code { background: #2a2a3e !important; color: #c9d1d9 !important; }
          table, th, td { border-color: #444 !important; background-color: rgba(26,26,46,0.9) !important; color: #e0e0e0 !important; }
          blockquote { border-color: #555 !important; color: #bbb !important; }
          ::selection { background: rgba(0,242,255,0.3) !important; color: #fff !important; }
          ::-webkit-scrollbar { width: 8px; }
          ::-webkit-scrollbar-track { background: #1a1a2e; }
          ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
        </style>`
        : "";

      /* ════════════════════════════════════════════════════════════
         PROXY INJECTION SCRIPT v2 — Uses _origUrl for resolution,
         MutationObserver for dynamic resources, proper URL handling
         ════════════════════════════════════════════════════════════ */
      const proxyScript = `<script data-sagex-proxy="1">
(function(){
  var _origUrl = "${currentUrl}";
  var _origOrigin = "${new URL(currentUrl).origin}";
  var _adblock = ${adblock ? "true" : "false"};
  var _dark = ${dark ? "true" : "false"};

  /* ── Resolve a URL relative to the ORIGINAL page, then convert to proxy URL ── */
  function proxyUrl(url) {
    if (!url) return url;
    if (typeof url !== 'string') url = String(url);
    if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('blob:') ||
        url.startsWith('about:') || url.startsWith('#') || url.startsWith('mailto:') ||
        url.startsWith('tel:') || url.includes('/api/proxy?url=')) return url;
    // Skip custom protocols
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('http:') && !url.startsWith('https:') && !url.startsWith('/')) return url;
    try {
      // CRITICAL: Resolve relative URLs against the ORIGINAL page URL, not location.href
      var absolute = new URL(url, _origUrl).href;
      return '/api/proxy?url=' + encodeURIComponent(absolute) + (_adblock ? '&adblock=true' : '') + (_dark ? '&dark=true' : '') + '&_t=' + Date.now();
    } catch(e) { return url; }
  }

  /* ── Check if a URL looks like it should be proxied ── */
  function shouldProxyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('blob:') ||
        url.startsWith('about:') || url.startsWith('#') || url.startsWith('mailto:') ||
        url.startsWith('tel:') || url.includes('/api/proxy?url=')) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('http:') && !url.startsWith('https:') && !url.startsWith('/')) return false;
    return true;
  }

  /* ── Rewrite attributes on a DOM element ── */
  function rewriteElementAttrs(el) {
    if (!el || !el.tagName) return;
    var tag = el.tagName.toUpperCase();
    // src attribute
    if (el.src && shouldProxyUrl(el.src)) {
      try { el.src = proxyUrl(el.getAttribute('src') || el.src); } catch(ex) {}
    }
    // href attribute
    if (el.href && shouldProxyUrl(el.href) && tag !== 'A') {
      // Don't rewrite anchor hrefs here (handled by click handler)
      try { el.href = proxyUrl(el.getAttribute('href') || el.href); } catch(ex) {}
    }
    // action attribute
    if (el.action && shouldProxyUrl(el.action)) {
      try { el.action = proxyUrl(el.getAttribute('action') || el.action); } catch(ex) {}
    }
    // poster attribute
    if (el.poster && shouldProxyUrl(el.poster)) {
      try { el.poster = proxyUrl(el.getAttribute('poster') || el.poster); } catch(ex) {}
    }
    // data-src
    var dataSrc = el.getAttribute('data-src');
    if (dataSrc && shouldProxyUrl(dataSrc)) {
      try { el.setAttribute('data-src', proxyUrl(dataSrc)); } catch(ex) {}
    }
    // srcset
    if (el.srcset) {
      try {
        var newSrcset = el.srcset.split(',').map(function(entry) {
          var parts = entry.trim().split(/\\s+/);
          if (parts[0] && shouldProxyUrl(parts[0])) parts[0] = proxyUrl(parts[0]);
          return parts.join(' ');
        }).join(', ');
        el.srcset = newSrcset;
      } catch(ex) {}
    }
  }

  /* ── MutationObserver — intercept dynamically added elements ── */
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      // Handle added nodes
      if (mutation.addedNodes) {
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          var node = mutation.addedNodes[j];
          if (node.nodeType === 1) { // Element node
            rewriteElementAttrs(node);
            // Also rewrite children
            var children = node.querySelectorAll && node.querySelectorAll('[src],[href],[action],[data-src],[srcset]');
            if (children) {
              for (var k = 0; k < children.length; k++) {
                rewriteElementAttrs(children[k]);
              }
            }
          }
        }
      }
      // Handle attribute changes
      if (mutation.type === 'attributes') {
        var attrName = mutation.attributeName;
        if (attrName === 'src' || attrName === 'href' || attrName === 'action' || attrName === 'data-src' || attrName === 'srcset') {
          rewriteElementAttrs(mutation.target);
        }
      }
    }
  });

  // Start observing once DOM is ready
  if (document.body) {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'action', 'data-src', 'srcset'] });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'action', 'data-src', 'srcset'] });
    });
  }

  /* ── Click interception ── */
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target.tagName !== 'A') target = target.parentElement;
    if (target && target.tagName === 'A') {
      if (target.target === '_blank') target.target = '_self';
      var href = target.getAttribute('href');
      if (href && shouldProxyUrl(href)) {
        try { target.setAttribute('href', proxyUrl(href)); } catch(ex) {}
      }
    }
  }, true);

  /* ── Form submission ── */
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form && form.action) {
      var action = form.getAttribute('action');
      if (action && shouldProxyUrl(action)) {
        try { form.action = proxyUrl(action); } catch(ex) {}
      }
    }
  }, true);

  /* ── Intercept fetch() ── */
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      if (shouldProxyUrl(input)) {
        input = proxyUrl(input);
      }
    } else if (input instanceof Request) {
      if (shouldProxyUrl(input.url)) {
        try { input = new Request(proxyUrl(input.url), input); } catch(ex) {}
      }
    }
    return origFetch.call(this, input, init);
  };

  /* ── Intercept XMLHttpRequest ── */
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    if (typeof url === 'string' && shouldProxyUrl(url)) {
      try { url = proxyUrl(url); } catch(ex) {}
    }
    return origOpen.call(this, method, url, async !== false, user, password);
  };

  /* ── Intercept createElement for link/script/img ── */
  var origCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName, options) {
    var el = origCreateElement(tagName, options);
    // Defer attribute rewriting — the caller will set src/href after creation
    var tag = (tagName || '').toUpperCase();
    if (tag === 'LINK' || tag === 'SCRIPT' || tag === 'IMG' || tag === 'IFRAME' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'SOURCE' || tag === 'FORM') {
      // Use defineProperty to intercept .src and .href setters
      var origSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'src') ||
                              Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src') ||
                              Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src') ||
                              Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
      // We rely on MutationObserver for attribute changes instead
    }
    return el;
  };

  /* ── Intercept history API ── */
  var origPush = history.pushState;
  history.pushState = function(state, title, url) {
    var result = origPush.apply(this, arguments);
    notifyParent(url);
    return result;
  };
  var origReplace = history.replaceState;
  history.replaceState = function(state, title, url) {
    var result = origReplace.apply(this, arguments);
    notifyParent(url);
    return result;
  };
  window.addEventListener('popstate', function() { notifyParent(location.href); });

  /* ── Intercept window.open ── */
  var origWindowOpen = window.open;
  window.open = function(url, target, features) {
    if (url && typeof url === 'string' && shouldProxyUrl(url)) {
      url = proxyUrl(url);
    }
    return origWindowOpen.call(this, url, '_self', features);
  };

  /* ── Intercept <object> and <embed> ── */
  document.addEventListener('DOMContentLoaded', function() {
    var objects = document.querySelectorAll('object[data], embed[src]');
    for (var i = 0; i < objects.length; i++) {
      rewriteElementAttrs(objects[i]);
    }
  });

  /* ── Notify parent of navigation ── */
  var lastNotifiedUrl = '';
  function notifyParent(navUrl) {
    try {
      var actualUrl = _origUrl;
      if (navUrl && typeof navUrl === 'string') {
        var match = navUrl.match(/[?&]url=([^&]+)/);
        if (match) {
          actualUrl = decodeURIComponent(match[1]);
        } else if (navUrl.startsWith('http')) {
          actualUrl = navUrl;
        }
      }
      if (actualUrl !== lastNotifiedUrl && window.parent !== window) {
        lastNotifiedUrl = actualUrl;
        window.parent.postMessage({ type: 'sagex-navigation', url: actualUrl }, '*');
      }
    } catch(e) {}
  }

  /* ── Page loaded notification ── */
  window.addEventListener('load', function() {
    if (window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'sagex-page-loaded',
          url: _origUrl,
          title: document.title || ''
        }, '*');
      } catch(e) {}
    }
  });

  /* ── Intercept resource errors ── */
  window.addEventListener('error', function(e) {
    if (e.target && e.target !== window) {
      var tag = e.target.tagName;
      if (tag === 'LINK' || tag === 'SCRIPT' || tag === 'IMG') {
        var src = e.target.href || e.target.src;
        if (src && !src.includes('/api/proxy')) {
          console.warn('[SageX Proxy] Resource failed, trying proxy:', src);
          // Try to reload through proxy
          if (tag === 'IMG' && e.target.src && shouldProxyUrl(e.target.getAttribute('src') || '')) {
            try { e.target.src = proxyUrl(e.target.getAttribute('src') || src); } catch(ex) {}
          }
        }
      }
    }
  }, true);

  /* ── Initial notification ── */
  setTimeout(function() { notifyParent(location.href); }, 200);
})();
</script>`;

      /* ── Inject into <head> — NO base href! ── */
      const injections = `${adBlockCSS}${darkModeCSS}${proxyScript}`;

      if (html.match(/<head[^>]*>/i)) {
        html = html.replace(/<head[^>]*>/i, `$&${injections}`);
      } else if (html.match(/<html[^>]*>/i)) {
        html = html.replace(/<html[^>]*>/i, `$&<head>${injections}</head>`);
      } else {
        html = `<!DOCTYPE html><html><head>${injections}</head><body>${html}</body></html>`;
      }

      // ── Remove CSP meta tags that block framing ──
      html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");

      responseHeaders.set("Content-Type", "text/html; charset=utf-8");

      return new NextResponse(html, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    /* ══════════════════════════════════════
       CSS — rewrite url() and @import references
       ══════════════════════════════════════ */
    if (contentType.includes("text/css")) {
      let css = new TextDecoder().decode(body);
      css = css.replace(/url\(\s*["']?([^"'\)]+)["']?\s*\)/gi, (_match, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("#") || url.includes("/api/proxy?url=")) return _match;
        try {
          const absoluteUrl = new URL(url, currentUrl).href;
          return `url("${buildProxyUrl(absoluteUrl, adblock, dark)}")`;
        } catch {
          return _match;
        }
      });
      css = css.replace(/@import\s+(?:url\(\s*)?["']?([^"'\);]+)["']?\s*\)?;/gi, (_m, url) => {
        if (url.startsWith("data:") || url.includes("/api/proxy?url=")) return _m;
        try {
          const absoluteUrl = new URL(url, currentUrl).href;
          return `@import url("${buildProxyUrl(absoluteUrl, adblock, dark)}");`;
        } catch {
          return _m;
        }
      });
      responseHeaders.set("Content-Type", "text/css; charset=utf-8");
      return new NextResponse(css, { status: response.status, headers: responseHeaders });
    }

    /* ══════════════════════════════════════
       JavaScript — rewrite import() and Worker URLs
       ══════════════════════════════════════ */
    if (contentType.includes("javascript")) {
      let js = new TextDecoder().decode(body);

      // Rewrite import() calls
      js = js.replace(/import\s*\(\s*["']([^"']+)["']\s*\)/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy?url=")) return _m;
        try {
          const absoluteUrl = new URL(url, currentUrl).href;
          return `import("${buildProxyUrl(absoluteUrl, adblock, dark)}")`;
        } catch {
          return _m;
        }
      });

      // Rewrite Worker constructors
      js = js.replace(/new\s+(?:Shared)?Worker\s*\(\s*["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy?url=")) return _m;
        try {
          const absoluteUrl = new URL(url, currentUrl).href;
          return `new Worker("${buildProxyUrl(absoluteUrl, adblock, dark)}"`;
        } catch {
          return _m;
        }
      });

      // Rewrite .src = "..." assignments for common patterns
      js = js.replace(/\.src\s*=\s*["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("javascript:") || url.includes("/api/proxy?url=") || url.startsWith("#")) return _m;
        try {
          const absoluteUrl = new URL(url, currentUrl).href;
          return `.src = "${buildProxyUrl(absoluteUrl, adblock, dark)}"`;
        } catch {
          return _m;
        }
      });

      // Rewrite .href = "..." assignments
      js = js.replace(/\.href\s*=\s*["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("javascript:") || url.includes("/api/proxy?url=") || url.startsWith("#")) return _m;
        try {
          const absoluteUrl = new URL(url, currentUrl).href;
          return `.href = "${buildProxyUrl(absoluteUrl, adblock, dark)}"`;
        } catch {
          return _m;
        }
      });

      responseHeaders.set("Content-Type", "application/javascript; charset=utf-8");
      return new NextResponse(js, { status: response.status, headers: responseHeaders });
    }

    /* ══════════════════════════════════════
       JSON — passthrough
       ══════════════════════════════════════ */
    if (contentType.includes("application/json")) {
      responseHeaders.set("Content-Type", "application/json; charset=utf-8");
      return new NextResponse(body, { status: response.status, headers: responseHeaders });
    }

    /* ══════════════════════════════════════
       SVG — rewrite xlink:href and href
       ══════════════════════════════════════ */
    if (contentType.includes("image/svg+xml") || contentType.includes("svg")) {
      let svg = new TextDecoder().decode(body);
      svg = svg.replace(/(xlink:href|href)=["']([^"']+)["']/gi, (_m, attr, url) => {
        if (url.startsWith("data:") || url.startsWith("#") || url.includes("/api/proxy?url=")) return _m;
        return `${attr}="${rewriteUrl(url)}"`;
      });
      responseHeaders.set("Content-Type", "image/svg+xml");
      return new NextResponse(svg, { status: response.status, headers: responseHeaders });
    }

    /* ══════════════════════════════════════
       XML/manifest — rewrite URLs
       ══════════════════════════════════════ */
    if (contentType.includes("xml") || contentType.includes("manifest")) {
      let xml = new TextDecoder().decode(body);
      xml = xml.replace(/(src|href)=["']([^"']+)["']/gi, (_m, attr, url) => {
        if (url.startsWith("data:") || url.startsWith("#") || url.includes("/api/proxy?url=")) return _m;
        return `${attr}="${rewriteUrl(url)}"`;
      });
      return new NextResponse(xml, { status: response.status, headers: responseHeaders });
    }

    /* ══════════════════════════════════════
       Binary — pass through (images, fonts, video, audio, etc.)
       ══════════════════════════════════════ */
    return new NextResponse(body, { status: response.status, headers: responseHeaders });
  } catch (error: any) {
    console.error("[SageX Proxy] Error:", error.message);
    return new NextResponse(
      errorPageHtml("Proxy Error", `An unexpected error occurred: ${error.message || "Unknown error"}`, targetUrl, adblock, dark),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

/* ── HTTP Method Handlers ── */

export async function GET(request: NextRequest) {
  return handleProxy(request, "GET");
}

export async function POST(request: NextRequest) {
  return handleProxy(request, "POST");
}

export async function PUT(request: NextRequest) {
  return handleProxy(request, "PUT");
}

export async function DELETE(request: NextRequest) {
  return handleProxy(request, "DELETE");
}

export async function PATCH(request: NextRequest) {
  return handleProxy(request, "PATCH");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
