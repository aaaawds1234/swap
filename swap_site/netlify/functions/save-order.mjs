export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const { order, signature } = JSON.parse(event.body || "{}");

    if (!order || !signature) {
      return {
        statusCode: 400,
        body: "Missing order or signature",
      };
    }

    // ⚠️ DEMO ONLY: in-memory storage
    globalThis.__ORDERS__ = globalThis.__ORDERS__ || {};
    const id = Date.now().toString(); // simple ID

    globalThis.__ORDERS__[id] = { order, signature };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    };
  } catch (err) {
    console.error("save-order error:", err);
    return {
      statusCode: 500,
      body: "Server error",
    };
  }
};
