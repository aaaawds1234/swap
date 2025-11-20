export const handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const id = params.id;

    if (!id) {
      return {
        statusCode: 400,
        body: "Missing id",
      };
    }

    globalThis.__ORDERS__ = globalThis.__ORDERS__ || {};
    const data = globalThis.__ORDERS__[id];

    if (!data) {
      return {
        statusCode: 404,
        body: "Order not found",
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("get-order error:", err);
    return {
      statusCode: 500,
      body: "Server error",
    };
  }
};
