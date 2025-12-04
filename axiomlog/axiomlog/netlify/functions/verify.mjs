exports.handler = async (event) => {
  const encodedId = event.queryStringParameters && event.queryStringParameters.id;

  if (!encodedId) {
    return { statusCode: 400, body: "Missing id parameter" };
  }

  let decoded;
  try {
    decoded = Buffer.from(encodedId, "base64").toString("utf8");
  } catch (error) {
    return { statusCode: 400, body: "Invalid base64 string" };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = -4992479317; // your group id

  let result = `Decoded id: ${decoded}\n\n`;

  // 1) Test generic outbound fetch FROM NETLIFY
  try {
    const testResp = await fetch("https://jsonplaceholder.typicode.com/todos/1");
    const testText = await testResp.text();
    result += `Test fetch status: ${testResp.status}\nTest fetch body:\n${testText}\n\n`;
  } catch (err) {
    result += `Test fetch FAILED: ${err.message}\n\n`;
  }

  // 2) Try Telegram
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: `Test message: ${decoded}`,
  };

  try {
    const tgResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const tgText = await tgResp.text();
    result += `Telegram status: ${tgResp.status}\nTelegram body:\n${tgText}\n`;
  } catch (err) {
    result += `Telegram fetch FAILED: ${err.message}\n`;
  }

  return {
    statusCode: 200,
    body: result,
  };
};
