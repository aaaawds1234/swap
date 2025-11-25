// netlify/functions/save-order.js

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const APP_BASE_URL = process.env.APP_BASE_URL; // e.g. "https://your-site.netlify.app"

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!DISCORD_WEBHOOK || !APP_BASE_URL) {
    console.error("Missing DISCORD_WEBHOOK_URL or APP_BASE_URL env var");
    return { statusCode: 500, body: "Server not configured" };
  }

  try {
    const { order, signature } = JSON.parse(event.body || "{}");
    if (!order || !signature) {
      return { statusCode: 400, body: "Missing order or signature" };
    }

    // Pack everything the taker needs
    const payload = { order, signature };

    // Encode payload into the URL hash so it never touches your server on load
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const link = `${APP_BASE_URL}/load.html#${encoded}`;

    // Send to Discord
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🆕 **New swap created!**\n${link}`
      })
    });

    // Also return link to the browser (optional, nice for UX)
    return {
      statusCode: 200,
      body: JSON.stringify({ link })
    };
  } catch (err) {
    console.error("save-order error:", err);
    return { statusCode: 500, body: "Internal Error" };
  }
}
