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

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url");
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

    const headersToForward: Record<string, string> = {
      "User-Agent": request.headers.get("user-agent") || "Mozilla/5.0",
      Accept: request.headers.get("accept") || "*/*",
      "Accept-Language": request.headers.get("accept-language") || "en-US,en;q=0.9",
      Referer: urlObj.origin,
      Origin: urlObj.origin,
    };

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: headersToForward,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        const absoluteLocation = new URL(location, targetUrl).href;
        return NextResponse.redirect(
          new URL(`/api/proxy?url=${encodeURIComponent(absoluteLocation)}`, request.url)
        );
      }
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.arrayBuffer();

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        ![
          "x-frame-options",
          "content-security-policy",
          "transfer-encoding",
          "content-encoding",
          "strict-transport-security",
          "access-control-allow-origin",
        ].includes(lowerKey)
      ) {
        responseHeaders.set(key, value);
      }
    });
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    if (contentType.includes("text/html")) {
      let html = new TextDecoder().decode(body);
      const baseHref = `${urlObj.protocol}//${urlObj.host}/`;

      const rewriteUrl = (url: string) => {
        if (!url || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("#"))
          return url;
        try {
          const absoluteUrl = new URL(url, targetUrl).href;
          return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        } catch {
          return url;
        }
      };

      html = html.replace(/(src|href|action)=["']([^"']+)["']/gi, (_match, attr, url) => {
        return `${attr}="${rewriteUrl(url)}"`;
      });

      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head><base href="${baseHref}">`);
      }
      return new NextResponse(html, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json({ error: `Proxy error: ${error.message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url");
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

    const body = await request.arrayBuffer();

    const headersToForward: Record<string, string> = {
      "User-Agent": request.headers.get("user-agent") || "Mozilla/5.0",
      "Content-Type": request.headers.get("content-type") || "application/json",
      Referer: urlObj.origin,
      Origin: urlObj.origin,
    };

    if (request.headers.get("authorization")) {
      headersToForward["authorization"] = request.headers.get("authorization")!;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: headersToForward,
      body,
    });

    const responseBody = await response.arrayBuffer();
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Content-Type", response.headers.get("content-type") || "application/json");

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json({ error: `Proxy error: ${error.message}` }, { status: 500 });
  }
}
