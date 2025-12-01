const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const APP_BASE_URL    = process.env.APP_BASE_URL;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",         
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: "Method not allowed"
    };
  }

  if (!DISCORD_WEBHOOK || !APP_BASE_URL) {
    console.error("Missing DISCORD_WEBHOOK_URL or APP_BASE_URL");
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: "Server not configured"
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const compact   = body.compactPayload;
    const tradeCode = body.tradeCode;

    if (
      !compact ||
      !compact.meta ||
      compact.meta.v !== 1 ||
      !compact.maker ||
      !compact.taker ||
      !compact.orderMeta ||
      !compact.signature
    ) {
      console.error("Bad compact payload:", compact);
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: "Missing or invalid compact payload"
      };
    }

    const encoded = encodeURIComponent(JSON.stringify(compact));
    const link = `${APP_BASE_URL}/loadswap.html#${encoded}`;

    const { maker, taker } = compact;
    const nftCount = Array.isArray(maker.tokenIds)
      ? maker.tokenIds.length
      : 0;

    const humanAmount = taker.amount; 

    let message =
      `@everyone swap created` +
      `\n\n` +
      `[accept swap](${link})` +
      `\n\n` +
      `you send:\n` +
      `${humanAmount} WEI` +
      `\n\n` +
      `they send:\n` +
      `${maker.collection} (${nftCount} NFTs)`;

    if (tradeCode) {
      message += `\n\ntrade code: \`${tradeCode}\``;
    }

    const discordRes = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message })
    });

    if (!discordRes.ok) {
      const txt = await discordRes.text().catch(() => "");
      console.error(
        "Discord webhook failed:",
        discordRes.status,
        discordRes.statusText,
        txt
      );
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: "Discord webhook failed"
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ link })
    };
  } catch (err) {
    console.error("save-order error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: "Internal Error"
    };
  }
}
