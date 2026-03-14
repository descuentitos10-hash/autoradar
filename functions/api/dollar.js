/**
 * Cloudflare Pages Function: /api/dollar
 * Devuelve cotización del dólar blue en tiempo real.
 */

export async function onRequestGet() {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/blue", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error("API error");
    const data = await r.json();
    return new Response(JSON.stringify({ venta: data.venta, compra: data.compra }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response(JSON.stringify({ venta: 1200, compra: 1180 }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
