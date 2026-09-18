const EMBEDDING_MODEL =
  'gemini-embedding-2';

export async function createEmbedding(
  text: string,
  apiKey?: string
): Promise<number[]> {

  const key =
    apiKey?.trim();

  if (!key) {
    throw new Error(
      'Gemini API Key পাওয়া যায়নি।'
    );
  }

  const response =
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'x-goog-api-key':
            key
        },

        body: JSON.stringify({
          content: {
            parts: [
              {
                text
              }
            ]
          },

          outputDimensionality: 768
        })
      }
    );

  if (!response.ok) {

    const error =
      await response.text();

    throw new Error(
      `Embedding error: ${error}`
    );
  }

  const data =
    await response.json();

  const values =
    data?.embedding?.values;

  if (
    !Array.isArray(values) ||
    values.length === 0
  ) {
    throw new Error(
      'Embedding vector পাওয়া যায়নি।'
    );
  }

  return values;
}