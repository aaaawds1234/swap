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
    const body = JSON.parse(event.body || "{}");
    const compact = body.compactPayload;
    const tradeCode = body.tradeCode;

    // ---- basic validation of compact payload ----
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
        body: "Missing or invalid compact payload"
      };
    }

    // This is what loadswap.html will decode and rebuild into a full 0x order
    const encoded = encodeURIComponent(JSON.stringify(compact));
    const link = `${APP_BASE_URL}/loadswap.html#${encoded}`;

    const { maker, taker } = compact;
    const nftCount = Array.isArray(maker.tokenIds)
      ? maker.tokenIds.length
      : 0;

    // You can later pretty-print this if you want (e.g. formatUnits).
    const humanAmount = taker.amount;

    let message =
      `@everyone swap created` +
      `\n\n` +
      `[accept swap](${link})` +
      `\n\n` +
      `you send:\n` +
      `**${humanAmount} WEI**` +
      `\n\n` +
      `they send:\n` +
      `https://opensea.io/item/ethereum/${maker.collection} (${nftCount} NFTs)`;

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
        body: "Discord webhook failed"
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ link })
    };
  } catch (err) {
    console.error("save-order error:", err);
    return { statusCode: 500, body: "Internal Error" };
  }
}
