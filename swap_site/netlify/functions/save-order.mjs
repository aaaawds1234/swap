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
    const { compactPayload, tradeCode } = JSON.parse(event.body || "{}");

    if (!compactPayload || !compactPayload.meta || !compactPayload.signature) {
      return { statusCode: 400, body: "Missing compact payload or signature" };
    }

    const encoded = encodeURIComponent(JSON.stringify(compactPayload));
    const link = `${APP_BASE_URL}/loadswap.html#${encoded}`;

    // For the Discord message we can show:
    // - taker amount / token
    // - collection + count
    const { meta, maker, taker, signature } = compactPayload;
    const nftCount = Array.isArray(maker.tokenIds) ? maker.tokenIds.length : 0;

    const humanAmount = taker.amount; // you can pretty-print if you want

    const message =
      `@everyone swap created` +
      `\n\n` +
      `[accept swap](${link})` +
      `\n\n` +
      `you send:\n` +
      `**${humanAmount} WETH**` +
      `\n\n` +
      `they send:\n` +
      `${maker.collection} (${nftCount} NFTs)` +
      (tradeCode
        ? `\n\ntrade code: \`${tradeCode}\``
        : "");

    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message })
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
