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
   PROXY HANDLER — Full web proxy with HTML/JS/CSS rewriting,
   ad blocking, dark mode injection, cookie rewriting, and CORS
   ═══════════════════════════════════════════════════════════════ */

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
      return NextResponse.json({ error: "Target host is not allowed" }, { status: 403 });
    }

    /* ── Build forwarded headers ── */
    const headersToForward: Record<string, string> = {
      "User-Agent":
        request.headers.get("user-agent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: request.headers.get("accept") || "*/*",
      "Accept-Language": request.headers.get("accept-language") || "en-US,en;q=0.9",
      "Accept-Encoding": "identity", // no compression so we can rewrite
      Referer: urlObj.origin,
      Origin: urlObj.origin,
    };

    if (request.headers.get("cookie")) headersToForward["cookie"] = request.headers.get("cookie")!;
    if (request.headers.get("content-type"))
      headersToForward["content-type"] = request.headers.get("content-type")!;
    if (request.headers.get("authorization"))
      headersToForward["authorization"] = request.headers.get("authorization")!;

    /* ── Fetch ── */
    const fetchOptions: RequestInit = {
      method,
      headers: headersToForward,
      redirect: "manual",
    };

    if (!["GET", "HEAD"].includes(method)) {
      fetchOptions.body = await request.arrayBuffer();
    }

    const response = await fetch(targetUrl, fetchOptions);

    /* ── Handle redirects ── */
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const absoluteLocation = new URL(location, targetUrl).href;
        const redirUrl = `/api/proxy?url=${encodeURIComponent(absoluteLocation)}${adblock ? "&adblock=true" : ""}${dark ? "&dark=true" : ""}`;
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
        ].includes(lowerKey)
      ) {
        responseHeaders.set(key, value);
      }
    });
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    responseHeaders.set("Access-Control-Allow-Credentials", "true");

    /* ── Rewrite Set-Cookie ── */
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const newCookie = cookie
        .replace(/Domain=[^;]+;?/gi, "")
        .replace(/SameSite=[^;]+;?/gi, "SameSite=Lax;")
        .replace(/Secure;?/gi, "")
        .replace(/Path=\/?/gi, "Path=/api/proxy");
      responseHeaders.append("Set-Cookie", newCookie);
    }

    /* ══════════════════════════════════════
       HTML — full rewrite + injection
       ══════════════════════════════════════ */
    if (contentType.includes("text/html")) {
      let html = new TextDecoder().decode(body);
      const baseHref = `${urlObj.protocol}//${urlObj.host}/`;

      const rewriteUrl = (url: string) => {
        if (!url || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("#") || url.startsWith("blob:"))
          return url;
        try {
          const absoluteUrl = new URL(url, targetUrl).href;
          return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}${adblock ? "&adblock=true" : ""}${dark ? "&dark=true" : ""}`;
        } catch {
          return url;
        }
      };

      // Rewrite src, href, action attributes (single & double quotes)
      html = html.replace(/(src|href|action)=["']([^"']+)["']/gi, (_m, attr, url) => {
        return `${attr}="${rewriteUrl(url)}"`;
      });
      html = html.replace(/(src|href|action)=([^\s>]+)/gi, (_m, attr, url) => {
        return `${attr}=${rewriteUrl(url.replace(/["']/g, ""))}`;
      });

      // Rewrite srcset (complex format: url 1x, url 2x)
      html = html.replace(/srcset=["']([^"']+)["']/gi, (_m, srcset) => {
        const newSrcset = srcset
          .split(",")
          .map((entry: string) => {
            const parts = entry.trim().split(/\s+/);
            parts[0] = rewriteUrl(parts[0]);
            return parts.join(" ");
          })
          .join(", ");
        return `srcset="${newSrcset}"`;
      });

      /* ── AdBlock ── */
      if (adblock) {
        // Remove known ad scripts
        html = html.replace(
          /<script[^>]*src=["'][^"']*(doubleclick|google-analytics|googlesyndication|popads|adsense|googleadservices|amazon-adsystem|facebook.*plugin|connect\.facebook|analytics\.tiktok|clarity\.ms|hotjar|cdn\.amplitude|segment\.io|optimizely)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
          ""
        );
        // Remove ad iframes
        html = html.replace(
          /<iframe[^>]*src=["'][^"']*(doubleclick|googlesyndication|ads|adserver|ad\.|adservice)[^"']*["'][^>]*>[\s\S]*?<\/iframe>/gi,
          ""
        );
        // Remove inline ad divs
        html = html.replace(
          /<div[^>]*(class|id)=["'][^"']*(ad[_-]?container|ad[_-]?wrapper|ad[_-]?slot|advertisement|sponsor|promo[_-]?box|google[_-]?ad)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
          ""
        );
      }

      /* ── AdBlock CSS ── */
      const adBlockCSS = adblock
        ? `<style>
          .ad, .ads, .ad-container, .ad-wrapper, .ad-slot, .advertisement, .ad-banner,
          .sponsor, .promoted, .promo-box, .google-ad, .ad-wrapper,
          [id*="ad-"], [class*="ad-"], [id*="AdSlot"], [class*="AdSlot"],
          [id*="banner-ad"], [class*="banner-ad"],
          [id*="google_ad"], [class*="google_ad"],
          [id*="AdContainer"], [class*="AdContainer"],
          iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
          div[class*="AdSlot"], div[id*="AdSlot"],
          [data-ad], [data-ad-slot], [data-adunit],
          .sidebar-ad, .in-article-ad, .in-feed-ad, .native-ad,
          #ads, #ad, #ad1, #ad2, .commercial-unit { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
        </style>`
        : "";

      /* ── Dark Mode CSS ── */
      const darkModeCSS = dark
        ? `<style>
          html, body { background: #1a1a2e !important; color: #e0e0e0 !important; }
          * { background-color: rgba(26,26,46,0.92) !important; color: #e0e0e0 !important; border-color: #333 !important; }
          a { color: #66b3ff !important; }
          img, video, canvas, svg, iframe { background-color: transparent !important; }
          input, textarea, select { background: #2a2a3e !important; color: #e0e0e0 !important; border: 1px solid #444 !important; }
          pre, code { background: #2a2a3e !important; color: #c9d1d9 !important; }
          h1,h2,h3,h4,h5,h6 { color: #fff !important; }
        </style>`
        : "";

      /* ── Proxy Injection Script ── */
      const proxyScript = `<script data-sagex-proxy="1">
        (function(){
          var _baseURL = "${targetUrl}";
          var _proxyPrefix = "/api/proxy?url=" + encodeURIComponent(_baseURL).split(_baseURL)[0] + encodeURIComponent;
          var _adblock = ${adblock ? "true" : "false"};
          var _dark = ${dark ? "true" : "false"};

          function proxyUrl(url) {
            if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('blob:') || url.startsWith('about:') || url.includes('/api/proxy')) return url;
            try { return '/api/proxy?url=' + encodeURIComponent(new URL(url, _baseURL).href) + (_adblock ? '&adblock=true' : '') + (_dark ? '&dark=true' : ''); }
            catch(e) { return url; }
          }

          /* Click interception — prevent target=_blank */
          document.addEventListener('click', function(e) {
            var target = e.target.closest && e.target.closest('a');
            if (target) {
              if (target.target === '_blank') target.target = '_self';
              if (target.href && !target.href.startsWith('data:') && !target.href.startsWith('javascript:') && !target.href.includes('/api/proxy')) {
                e.preventDefault();
                e.stopPropagation();
                target.href = proxyUrl(target.href);
              }
            }
          }, true);

          /* Form submission — rewrite action */
          document.addEventListener('submit', function(e) {
            var form = e.target;
            if (form && form.action && !form.action.includes('/api/proxy')) {
              try { form.action = proxyUrl(form.action); } catch(ex) {}
            }
          }, true);

          /* Intercept fetch() */
          var origFetch = window.fetch;
          window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
            if (url && !url.startsWith('data:') && !url.startsWith('blob:') && !url.includes('/api/proxy')) {
              var proxiedUrl = proxyUrl(url);
              if (typeof input === 'string') { input = proxiedUrl; }
              else { try { input = new Request(proxiedUrl, input); } catch(ex) {} }
            }
            return origFetch.call(this, input, init);
          };

          /* Intercept XMLHttpRequest */
          var origOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:') && !url.includes('/api/proxy')) {
              try { url = proxyUrl(url); } catch(ex) {}
            }
            return origOpen.call(this, method, url, async !== false, user, password);
          };

          /* Intercept history.pushState / replaceState */
          var origPush = history.pushState;
          history.pushState = function(state, title, url) {
            if (url && typeof url === 'string' && !url.includes('/api/proxy')) {
              try { url = proxyUrl(url); } catch(ex) {}
            }
            return origPush.call(this, state, title, url);
          };
          var origReplace = history.replaceState;
          history.replaceState = function(state, title, url) {
            if (url && typeof url === 'string' && !url.includes('/api/proxy')) {
              try { url = proxyUrl(url); } catch(ex) {}
            }
            return origReplace.call(this, state, title, url);
          };

          /* Intercept window.open */
          var origWindowOpen = window.open;
          window.open = function(url, target, features) {
            if (url && typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('javascript:') && !url.includes('/api/proxy')) {
              url = proxyUrl(url);
            }
            return origWindowOpen.call(this, url, '_self', features);
          };

          /* Notify parent of navigation for URL bar sync */
          var lastNotifiedUrl = '';
          function notifyParent() {
            try {
              var currentUrl = _baseURL;
              if (window.parent !== window) {
                window.parent.postMessage({ type: 'sagex-navigation', url: currentUrl }, '*');
              }
            } catch(e) {}
          }

          /* Track URL changes via History API */
          var origPush2 = history.pushState;
          history.pushState = function() {
            var result = origPush2.apply(this, arguments);
            setTimeout(notifyParent, 50);
            return result;
          };
          var origReplace2 = history.replaceState;
          history.replaceState = function() {
            var result = origReplace2.apply(this, arguments);
            setTimeout(notifyParent, 50);
            return result;
          };
          window.addEventListener('popstate', function() { setTimeout(notifyParent, 50); });

          /* Intercept error pages */
          window.addEventListener('error', function(e) {
            console.warn('[SageX Proxy] Resource error:', e.message);
          }, true);

          /* Page loaded notification */
          window.addEventListener('load', function() {
            if (window.parent !== window) {
              try {
                window.parent.postMessage({
                  type: 'sagex-page-loaded',
                  url: _baseURL,
                  title: document.title || ''
                }, '*');
              } catch(e) {}
            }
          });
        })();
      </script>`;

      /* ── Inject into <head> ── */
      const injections = `<base href="${baseHref}">${adBlockCSS}${darkModeCSS}${proxyScript}`;

      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head>${injections}`);
      } else if (html.includes("<HEAD>")) {
        html = html.replace("<HEAD>", `<HEAD>${injections}`);
      } else {
        html = `<!DOCTYPE html><html><head>${injections}</head><body>${html}</body></html>`;
      }

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
      css = css.replace(/url\(["']?([^"'\)]+)["']?\)/gi, (_match, url) => {
        if (url.startsWith("data:") || url.startsWith("blob:")) return _match;
        try {
          const absoluteUrl = new URL(url, targetUrl).href;
          return `url("/api/proxy?url=${encodeURIComponent(absoluteUrl)}${adblock ? "&adblock=true" : ""}${dark ? "&dark=true" : ""}")`;
        } catch {
          return _match;
        }
      });
      return new NextResponse(css, { status: response.status, headers: responseHeaders });
    }

    /* ══════════════════════════════════════
       JavaScript — rewrite import/worker URLs
       ══════════════════════════════════════ */
    if (contentType.includes("javascript") || contentType.includes("application/json")) {
      let js = new TextDecoder().decode(body);

      // Rewrite import() and import.meta.url patterns in JS
      if (contentType.includes("javascript")) {
        js = js.replace(/import\s*\(\s*["']([^"']+)["']\s*\)/gi, (_m, url) => {
          if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy")) return _m;
          try {
            const absoluteUrl = new URL(url, targetUrl).href;
            return `import("/api/proxy?url=${encodeURIComponent(absoluteUrl)}${adblock ? "&adblock=true" : ""}${dark ? "&dark=true" : ""}")`;
          } catch {
            return _m;
          }
        });

        // Rewrite Worker / SharedWorker constructors
        js = js.replace(/new\s+(?:Shared)?Worker\s*\(\s*["']([^"']+)["']/gi, (_m, url) => {
          if (url.startsWith("data:") || url.startsWith("blob:") || url.includes("/api/proxy")) return _m;
          try {
            const absoluteUrl = new URL(url, targetUrl).href;
            return `new Worker("/api/proxy?url=${encodeURIComponent(absoluteUrl)}${adblock ? "&adblock=true" : ""}${dark ? "&dark=true" : ""}"`;
          } catch {
            return _m;
          }
        });
      }

      return new NextResponse(js, { status: response.status, headers: responseHeaders });
    }

    /* ══════════════════════════════════════
       Binary — pass through (images, fonts, etc.)
       ══════════════════════════════════════ */
    return new NextResponse(body, { status: response.status, headers: responseHeaders });
  } catch (error: any) {
    console.error("[SageX Proxy] Error:", error.message);
    return NextResponse.json({ error: `Proxy error: ${error.message}` }, { status: 500 });
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
