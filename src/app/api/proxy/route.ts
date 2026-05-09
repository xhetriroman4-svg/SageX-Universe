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
   ROBUST WEB PROXY — Handles HTML/CSS/JS rewriting, ad blocking,
   dark mode, cookie isolation, redirects, error pages, timeouts
   ═══════════════════════════════════════════════════════════════ */

const FETCH_TIMEOUT = 15000; // 15s timeout

function buildProxyUrl(url: string, adblock: boolean, dark: boolean) {
  return `/api/proxy?url=${encodeURIComponent(url)}${adblock ? "&adblock=true" : ""}${dark ? "&dark=true" : ""}`;
}

function errorPageHtml(title: string, message: string, originalUrl: string, adblock: boolean, dark: boolean) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
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
  <div class="error-icon">🌐</div>
  <div class="error-title">${title}</div>
  <div class="error-msg">${message}</div>
  <div class="error-url">${originalUrl}</div>
  <div>
    <a class="btn btn-primary" href="${buildProxyUrl(originalUrl, adblock, dark)}">⟳ Retry</a>
    <a class="btn btn-secondary" href="${originalUrl}" target="_blank" rel="noopener">↗ Open Directly</a>
  </div>
</div>
<script>
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'sagex-page-error', url: "${originalUrl}", title: "${title}" }, '*');
  }
</script>
</body></html>`;
}

async function handleProxy(request: NextRequest, method: string) {
  const targetUrl = request.nextUrl.searchParams.get("url");
  const adblock = request.nextUrl.searchParams.get("adblock") === "true";
  const dark = request.nextUrl.searchParams.get("dark") === "true";

  if (!targetUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
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

    /* ── Handle redirects (follow up to 10) ── */
    let redirectCount = 0;
    let currentUrl = targetUrl;
    while (response.status >= 300 && response.status < 400 && redirectCount < 10) {
      const location = response.headers.get("location");
      if (!location) break;
      const absoluteLocation = new URL(location, currentUrl).href;
      // Instead of redirecting the browser, follow the redirect server-side
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

    /* ── Build response headers ── */
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
        ].includes(lowerKey)
      ) {
        responseHeaders.set(key, value);
      }
    });
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    responseHeaders.delete("content-encoding");

    /* ── Rewrite Set-Cookie ── */
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      let newCookie = cookie
        .replace(/Domain=[^;]+;?/gi, "")
        .replace(/SameSite=[^;]+;?/gi, "SameSite=Lax;")
        .replace(/Secure;?/gi, "");
      // Keep the path as-is rather than rewriting to /api/proxy, which breaks cookies
      if (!/Path=/i.test(newCookie)) {
        newCookie += "; Path=/";
      }
      responseHeaders.append("Set-Cookie", newCookie);
    }

    /* ── Helper: rewrite a URL to go through proxy ── */
    const rewriteUrl = (url: string): string => {
      if (!url || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("#") || url.startsWith("blob:") || url.startsWith("about:") || url.includes("/api/proxy?url=")) return url;
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
      const baseHref = new URL(currentUrl).origin + "/";

      // ── Rewrite <meta http-equiv="refresh"> ──
      html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?(\d+;\s*url=)([^"'>]+)["']?[^>]*>/gi,
        (_m, prefix, url) => {
          return `<meta http-equiv="refresh" content="${prefix}${rewriteUrl(url.trim())}">`;
        }
      );

      // ── Rewrite src, href, action attributes ──
      // Double-quoted attributes
      html = html.replace(/(src|href|action)=["']([^"']+)["']/gi, (_m, attr, url) => {
        // Skip data:, javascript:, blob:, about: URLs and inline SVG
        if (url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("blob:") || url.startsWith("about:") || url.startsWith("#")) return _m;
        // Skip already-proxied URLs
        if (url.includes("/api/proxy?url=")) return _m;
        return `${attr}="${rewriteUrl(url)}"`;
      });
      // Unquoted attributes
      html = html.replace(/(src|href|action)=([^\s>"'][^\s>]*)/gi, (_m, attr, url) => {
        if (url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("blob:") || url.startsWith("about:") || url.startsWith("#")) return _m;
        if (url.includes("/api/proxy?url=")) return _m;
        return `${attr}=${rewriteUrl(url.replace(/["']/g, ""))}`;
      });

      // ── Rewrite srcset ──
      html = html.replace(/srcset=["']([^"']+)["']/gi, (_m, srcset) => {
        const newSrcset = srcset
          .split(",")
          .map((entry: string) => {
            const parts = entry.trim().split(/\s+/);
            if (parts[0] && !parts[0].startsWith("data:") && !parts[0].startsWith("blob:")) {
              parts[0] = rewriteUrl(parts[0]);
            }
            return parts.join(" ");
          })
          .join(", ");
        return `srcset="${newSrcset}"`;
      });

      // ── Rewrite <link> stylesheet/style URLs ──
      html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (_m, url) => {
        if (url.startsWith("data:") || url.includes("/api/proxy?url=")) return _m;
        return _m.replace(url, rewriteUrl(url));
      });

      // ── Rewrite <img> srcset and loading attributes ──
      html = html.replace(/<img[^>]+src=["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy?url=")) return _m;
        return _m.replace(url, rewriteUrl(url));
      });

      // ── Rewrite <source> src ──
      html = html.replace(/<source[^>]+src=["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy?url=")) return _m;
        return _m.replace(url, rewriteUrl(url));
      });

      // ── Rewrite poster attribute on video ──
      html = html.replace(/poster=["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.includes("/api/proxy?url=")) return _m;
        return `poster="${rewriteUrl(url)}"`;
      });

      // ── Rewrite data-src for lazy-loaded images ──
      html = html.replace(/data-src=["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy?url=")) return _m;
        return `data-src="${rewriteUrl(url)}"`;
      });

      // ── Rewrite data-bg, data-lazy-src ──
      html = html.replace(/data-(?:bg|lazy-src|lazy|original)=["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy?url=")) return _m;
        return _m.replace(url, rewriteUrl(url));
      });

      // ── AdBlock ──
      if (adblock) {
        // Remove known ad/tracking scripts
        html = html.replace(
          /<script[^>]*src=["'][^"']*(doubleclick|google-analytics|googlesyndication|googleadservices|googletagmanager|popads|adsense|amazon-adsystem|facebook\.net.*plugin|connect\.facebook|analytics\.tiktok|clarity\.ms|hotjar|cdn\.amplitude|segment\.io|optimizely|chartbeat|newrelic|nr-data|mixpanel|heap\.io|fullstory|mouseflow|crazyegg|quantserve|scorecardresearch|outbrain|taboola|criteo|adnxs|rubiconproject|pubmatic|openx|casalemedia|indexww|moatads|sharethis|addthis|disqus)[^"']*["'][^>]*><\/script>/gi,
          ""
        );
        // Remove ad iframes
        html = html.replace(
          /<iframe[^>]*src=["'][^"']*(doubleclick|googlesyndication|ads|adserver|ad\.|adservice|amazon-adsystem|taboola|outbrain)[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi,
          ""
        );
        // Remove inline ad containers
        html = html.replace(
          /<div[^>]*(class|id)=["'][^"']*(ad[_-]?container|ad[_-]?wrapper|ad[_-]?slot|advertisement|sponsor|promo[_-]?box|google[_-]?ad|taboola|outbrain)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
          ""
        );
        // Remove noscript ad tags
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
         PROXY INJECTION SCRIPT — Intercepts navigation, fetch, XHR,
         form submissions, and syncs URL bar with parent frame
         ════════════════════════════════════════════════════════════ */
      const proxyScript = `<script data-sagex-proxy="1">
(function(){
  var _origUrl = "${currentUrl}";
  var _adblock = ${adblock ? "true" : "false"};
  var _dark = ${dark ? "true" : "false"};

  function proxyUrl(url) {
    if (!url) return url;
    if (typeof url !== 'string') url = String(url);
    if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('blob:') ||
        url.startsWith('about:') || url.startsWith('#') || url.includes('/api/proxy?url=')) return url;
    try {
      var absolute = new URL(url, location.href).href;
      return '/api/proxy?url=' + encodeURIComponent(absolute) + (_adblock ? '&adblock=true' : '') + (_dark ? '&dark=true' : '');
    } catch(e) { return url; }
  }

  /* ── Click interception ── */
  document.addEventListener('click', function(e) {
    var target = e.target;
    // Walk up to find anchor
    while (target && target.tagName !== 'A') target = target.parentElement;
    if (target && target.tagName === 'A') {
      if (target.target === '_blank') target.target = '_self';
      var href = target.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('data:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        var proxied = proxyUrl(href);
        location.assign(proxied);
      }
    }
  }, true);

  /* ── Form submission ── */
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form && form.action) {
      var action = form.getAttribute('action');
      if (action && !action.includes('/api/proxy')) {
        try { form.action = proxyUrl(action); } catch(ex) {}
      }
    }
  }, true);

  /* ── Intercept fetch() ── */
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      if (!input.startsWith('data:') && !input.startsWith('blob:') && !input.includes('/api/proxy')) {
        input = proxyUrl(input);
      }
    } else if (input instanceof Request) {
      if (!input.url.startsWith('data:') && !input.url.startsWith('blob:') && !input.url.includes('/api/proxy')) {
        try { input = new Request(proxyUrl(input.url), input); } catch(ex) {}
      }
    }
    return origFetch.call(this, input, init);
  };

  /* ── Intercept XMLHttpRequest ── */
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:') && !url.includes('/api/proxy')) {
      try { url = proxyUrl(url); } catch(ex) {}
    }
    return origOpen.call(this, method, url, async !== false, user, password);
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
    if (url && typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('javascript:') && !url.includes('/api/proxy')) {
      url = proxyUrl(url);
    }
    return origWindowOpen.call(this, url, '_self', features);
  };

  /* ── Notify parent of navigation ── */
  var lastNotifiedUrl = '';
  function notifyParent(navUrl) {
    try {
      // Decode the actual URL from the proxy URL
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

  /* ── Intercept errors to show fallback ── */
  window.addEventListener('error', function(e) {
    console.warn('[SageX Proxy] Resource error:', e.message);
  }, true);

  /* ── Initial notification ── */
  setTimeout(function() { notifyParent(location.href); }, 200);
})();
</script>`;

      /* ── Inject into <head> ── */
      const injections = `<base href="${baseHref}">${adBlockCSS}${darkModeCSS}${proxyScript}`;

      if (html.match(/<head[^>]*>/i)) {
        html = html.replace(/<head[^>]*>/i, `$&${injections}`);
      } else if (html.match(/<html[^>]*>/i)) {
        html = html.replace(/<html[^>]*>/i, `$&<head>${injections}</head>`);
      } else {
        html = `<!DOCTYPE html><html><head>${injections}</head><body>${html}</body></html>`;
      }

      // ── Inject CSP meta tag to prevent framing issues ──
      // Remove any existing CSP meta tags
      html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");

      responseHeaders.set("Content-Type", "text/html; charset=utf-8");

      return new NextResponse(html, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    /* ══════════════════════════════════════
       CSS — rewrite url() references
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
      // Also rewrite @import statements
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
       JavaScript — rewrite URLs in code
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

      // Rewrite dynamic script src assignments like .src = "..."
      js = js.replace(/\.src\s*=\s*["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("javascript:") || url.includes("/api/proxy?url=")) return _m;
        try {
          const absoluteUrl = new URL(url, currentUrl).href;
          return `.src = "${buildProxyUrl(absoluteUrl, adblock, dark)}"`;
        } catch {
          return _m;
        }
      });

      // Rewrite .href assignments
      js = js.replace(/\.href\s*=\s*["']([^"']+)["']/gi, (_m, url) => {
        if (url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("#") || url.includes("/api/proxy?url=")) return _m;
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
