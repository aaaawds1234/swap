
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const APP_BASE_URL = process.env.APP_BASE_URL; 

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

    const payload = { order, signature };

    const encoded = encodeURIComponent(JSON.stringify(payload));
    const link = `${APP_BASE_URL}/loadswap.html#${encoded}`;

    const makerAsset = order.makerAssetData;
    const takerAsset = order.takerAssetData;

    const message =
      `🆕 **New swap created!**` +
      `\n\n` +
  `**Accept Swap:** ${link}` +
  `\n\n` +
  `**Maker Sends:**\n\`${makerAsset}\`` +
  `\n\n` +
  `**Taker Sends:**\n\`${takerAsset}\``;

    await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
    content: message
  })
});

    return {
      statusCode: 200,
      body: JSON.stringify({ link })
    };
  } catch (err) {
    console.error("save-order error:", err);
    return { statusCode: 500, body: "Internal Error" };
  }
}
