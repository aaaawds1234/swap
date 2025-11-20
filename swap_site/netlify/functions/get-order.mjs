import { neon } from "@netlify/neon";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return { statusCode: 400, body: "Missing id" };
    }

    const sql = neon(process.env.NETLIFY_DATABASE_URL);

    const rows = await sql`
      SELECT order_json, signature
      FROM orders
      WHERE order_id = ${id}
      LIMIT 1;
    `;

    if (rows.length === 0) {
      return { statusCode: 404, body: "Order not found" };
    }

    // rows[0].order_json is a JSON string; rows[0].signature is the hex sig
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: JSON.parse(rows[0].order_json),
        signature: rows[0].signature,
      }),
    };
  } catch (err) {
    console.error("get-order ERROR:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
