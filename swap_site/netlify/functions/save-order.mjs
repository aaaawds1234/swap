import { neon } from "@netlify/neon";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { order, signature } = JSON.parse(event.body || "{}");

    if (!order || !signature) {
      return { statusCode: 400, body: "Missing order or signature" };
    }

    // Simple unique ID for the URL
    const orderId = Date.now().toString();

    // Connect to your Netlify DB (Neon) using the env var Netlify set up
    const sql = neon(process.env.NETLIFY_DATABASE_URL);

    await sql`
      INSERT INTO orders (order_id, order_json, signature)
      VALUES (${orderId}, ${JSON.stringify(order)}, ${signature});
    `;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId }),
    };
  } catch (err) {
    console.error("save-order ERROR:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
