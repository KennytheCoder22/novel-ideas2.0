import 'dotenv/config';

const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

export async function GET(request: Request) {
  try {
    const token = process.env.HARDCOVER_API_TOKEN;
console.log("TOKEN:", process.env.HARDCOVER_API_TOKEN);
    const { searchParams } = new URL(request.url);
    const title = (searchParams.get("title") || "").trim();
    const author = (searchParams.get("author") || "").trim();

    if (!token) {
      return Response.json(
        { error: "Missing HARDCOVER_API_TOKEN on server." },
        { status: 500 }
      );
    }

    if (!title) {
      return Response.json(
        { error: "Missing required query parameter: title" },
        { status: 400 }
      );
    }

    const query = `
      query SearchBooks($title: String!, $author: String!) {
        books(
          where: {
            _and: [
              { title: { _ilike: $title } }
              { contributions: { author: { name: { _ilike: $author } } } }
            ]
          }
          limit: 1
        ) {
          title
          rating
          ratings_count
        }
      }
    `;

    const response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          title: `%${title}%`,
          author: `%${author || title}%`,
        },
      }),
    });

    const json = await response.json();

    return Response.json({
      ok: true,
      title,
      author,
      data: json?.data?.books?.[0] ?? null,
      raw: json,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      {
        error: "Hardcover proxy request failed.",
        details: message,
      },
      { status: 502 }
    );
  }
}