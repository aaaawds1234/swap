
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

    const takerAsset = order.takerAssetData.slice(34, 74);
    const mad = order.makerAssetData;
    const addressSlot = mad.slice(10, 74);            
    const makerAsset = addressSlot.slice(24);         
    const tokenIdHex = mad.slice(74);               
    const makerId = BigInt("0x" + tokenIdHex).toString(10);
    const osLink = `https://opensea.io/assets/ethereum/0x${makerAsset}/${makerId}`;

const message =
  `@everyone swap created` +
  `\n\n` +
  `[accept swap](${link})` +
  `\n\n` +
  `you send:\n0x${takerAsset} **(0.000001 WETH)**` +
  `\n\n` +
  `they send:\n${osLink}`;

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
