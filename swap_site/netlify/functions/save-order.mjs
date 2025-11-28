
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const APP_BASE_URL = process.env.APP_BASE_URL; 

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!DISCORD_WEBHOOK || !APP_BASE_URL) {
    console.error("Missing DISCORD_WEBHOOK_URL or APP_BASE_URL");
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

    const makerAsset = order.makerAssetData.slice(34, 74);
    const takerAsset = order.takerAssetData.slice(34, 74);

    const hexId = order.makerAssetData.slice(135, 138);
    const makerId = parseInt(hexId, 16);
    const osLink = `https://opensea.io/item/ethereum/0x${makerAsset}/${makerId}`

const message =
  `@everyone swap created` +
  `\n\n` +
  `[accept swap](${link})` +
  `\n\n` +
  `you send:\n ${takerAsset} **(0.000001 WETH)**` +
  `\n\n` +
  `they send:\n ${osLink}`;

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
