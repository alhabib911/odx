import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '../.env')
});

export type AIProvider = 'gemini' | 'groq';

const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const EMBEDDING_MODEL = 'gemini-embedding-2';

let geminiInstance: any = null;
let activeGeminiApiKey: string | null = null;

async function getGenAIClient(customKey?: string): Promise<any> {
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      '.env ফাইলে বা UI Settings-এ Gemini API Key পাওয়া যায়নি!'
    );
  }

  if (!geminiInstance || activeGeminiApiKey !== apiKey) {
    const { GoogleGenAI } = await import('@google/genai');

    geminiInstance = new GoogleGenAI({
      apiKey
    });

    activeGeminiApiKey = apiKey;
  }

  return geminiInstance;
}

async function groqRequest(
  model: string,
  prompt: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('Groq API Key পাওয়া যায়নি!');
  }

  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert full-stack coding assistant. Follow the user request exactly. Preserve working code and never introduce unnecessary architecture.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 16000,
        response_format: {
          type: 'json_object'
        }
      })
    }
  );

  const rawResponse = await response.text();

  if (!rawResponse.trim()) {
    throw new Error(
      `Groq empty HTTP response. Status: ${response.status}`
    );
  }

  let data: any;

  try {
    data = JSON.parse(rawResponse);
  } catch {
    throw new Error(
      `Groq invalid response: ${rawResponse.substring(0, 1000)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Groq API Error: ${response.status}`
    );
  }

  const choice = data?.choices?.[0];

  if (!choice) {
    console.error(
      'GROQ RESPONSE:',
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      'Groq response-এ কোনো choice পাওয়া যায়নি।'
    );
  }

  const message = choice?.message;

  let content = message?.content;

  if (Array.isArray(content)) {
    content = content
      .map((item: any) =>
        typeof item === 'string'
          ? item
          : item?.text || ''
      )
      .join('');
  }

  if (
    typeof content !== 'string' ||
    !content.trim()
  ) {
    console.error(
      'GROQ EMPTY CONTENT:',
      JSON.stringify(data, null, 2)
    );

    throw new Error(
      'Groq response এসেছে কিন্তু content empty।'
    );
  }

  return content.trim();
}

export async function getTaskSummaryInBangla(
  prompt: string,
  provider: AIProvider = 'gemini',
  modelName?: string,
  customKey?: string
): Promise<string> {
  try {
    const model =
      modelName ||
      (provider === 'groq'
        ? DEFAULT_GROQ_MODEL
        : DEFAULT_GEMINI_MODEL);

    const systemPrompt = `You are a helpful AI coding assistant.

Explain clearly in concise Bengali (বাংলা ফন্ট) what changes or tasks you are about to perform based on the user's instruction.

Keep it brief, maximum 2-3 sentences.

User Prompt:

${prompt}`;

    if (provider === 'groq') {
      if (!customKey) {
        throw new Error(
          'Groq API Key পাওয়া যায়নি!'
        );
      }

      return await groqRequest(
        model,
        systemPrompt,
        customKey
      );
    }

    const ai = await getGenAIClient(customKey);

    const response =
      await ai.models.generateContent({
        model,
        contents: systemPrompt
      });

    const text =
      typeof response.text === 'function'
        ? response.text()
        : response.text;

    return text || 'নির্দেশনাটি বোঝা গেছে।';
  } catch (error: any) {
    return `নির্দেশনা প্রক্রিয়াকরণে সমস্যা: ${
      error?.message || error
    }`;
  }
}

function cleanAIJson(rawText: string): string {
  let text = rawText.trim();

  text = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    text = text.substring(
      firstBrace,
      lastBrace + 1
    );
  }

  return text;
}

function cleanGeneratedCode(code: string): string {
  let cleaned = code.trim();

  cleaned = cleaned
    .replace(
      /^```(?:tsx|ts|typescript|jsx|javascript|js)?\s*/i,
      ''
    )
    .replace(/\s*```$/i, '')
    .trim();

  // Remove BOM / zero-width characters before "use client"
  cleaned = cleaned.replace(
    /^[\uFEFF\u200B\u200C\u200D]+/,
    ''
  );

  try {
    if (
      cleaned.startsWith('"') &&
      cleaned.endsWith('"')
    ) {
      const parsed = JSON.parse(cleaned);

      if (typeof parsed === 'string') {
        cleaned = parsed;
      }
    }
  } catch {
    // Ignore JSON decode failure
  }

  // Decode common escaped source-code responses.
  if (
    cleaned.includes('\\"') ||
    cleaned.includes('\\n') ||
    cleaned.includes('\\r') ||
    cleaned.includes('\\t')
  ) {
    try {
      const decoded = JSON.parse(
        `"${cleaned
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\\n/g, '\\n')
          .replace(/\\r/g, '\\r')
          .replace(/\\t/g, '\\t')
          .replace(/\\\\"/g, '\\"')}"`
      );

      if (typeof decoded === 'string') {
        cleaned = decoded;
      }
    } catch {
      cleaned = cleaned
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");
    }
  }

  // Remove invisible characters before "use client"
  cleaned = cleaned.replace(
    /^[\s\uFEFF\u200B\u200C\u200D]+(?="use client")/,
    ''
  );

  return cleaned.trim();
}

function buildCodingPrompt(
  prompt: string,
  existingCode: string,
  currentFilePath: string
): string {
  const hasExistingCode = Boolean(existingCode.trim());

  const lowerPrompt = prompt.toLowerCase();

  const isSimpleUIRequest =
    lowerPrompt.includes('button') ||
    lowerPrompt.includes('text') ||
    lowerPrompt.includes('heading') ||
    lowerPrompt.includes('title') ||
    lowerPrompt.includes('color') ||
    lowerPrompt.includes('css') ||
    lowerPrompt.includes('style') ||
    lowerPrompt.includes('ui') ||
    lowerPrompt.includes('design') ||
    lowerPrompt.includes('add ');

  return `You are ODX, an expert coding agent.

You modify real project files.

TECHNOLOGY:
- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase when actually required

YOUR MOST IMPORTANT RULE:

MAKE THE SMALLEST SAFE CHANGE THAT COMPLETELY SATISFIES THE USER REQUEST.

Do NOT rewrite working code unnecessarily.

Do NOT introduce new architecture unless the request requires it.

Do NOT add unrelated features.

Do NOT change existing functionality unless the user explicitly asks for it.

DO NOT create forms, server actions, database logic, authentication, APIs, hooks, state management, or extra components unless they are actually required by the user's request.

${
  isSimpleUIRequest
    ? `
THIS IS LIKELY A SIMPLE UI CHANGE.

For a simple UI request:
- Preserve the existing component.
- Preserve existing imports.
- Preserve existing hooks.
- Preserve existing state.
- Preserve existing forms.
- Preserve existing server actions.
- Only add/change the minimum JSX/CSS necessary.
- NEVER invent a form or Server Action.
- NEVER introduce useFormState.
- NEVER introduce useFormStatus.
- NEVER introduce useActionState unless explicitly requested.
- NEVER add "use server" for a simple UI change.
- NEVER rewrite the entire component just to add a button, text, style, or small UI element.
`
    : ''
}

NEXT.JS RULES:

1. If the file contains "use client", it MUST be the first statement in the file.

Correct:
"use client";

import ...

2. Never place imports, variables, comments, expressions, or other statements before "use client".

3. A Client Component should NOT contain an inline Server Action such as:

async function action() {
  "use server";
}

unless the architecture explicitly requires it.

4. Never mix unnecessary Server Actions with a Client Component.

5. Do not use deprecated or unnecessary APIs.

6. Do not introduce useFormState/useFormStatus/useActionState unless the requested functionality genuinely requires them.

7. If useRouter already exists, preserve it.

8. Do not change working imports unless required.

9. Keep Next.js App Router conventions valid.

CODE MODIFICATION RULES:

1. Read the existing code carefully.
2. Understand exactly what the user requested.
3. Modify only what is necessary.
4. Preserve everything else.
5. Return the COMPLETE updated file.
6. The returned code must compile.
7. Do not return partial code.
8. Do not return explanations.
9. Do not return markdown.
10. Do not return code fences.
11. Do not escape normal source-code quotes unnecessarily.
12. Keep the requested file path exactly:
"${currentFilePath}"

${
  hasExistingCode
    ? `
IMPORTANT:
The existing code is already part of a real project.

Treat it as working code.

Do NOT replace it with a completely different implementation unless absolutely necessary.

Existing Code:
----------------
${existingCode}
----------------
`
    : `
No existing code is available.

Create the requested file from scratch.
`
}

USER REQUEST:
----------------
${prompt}
----------------

TARGET FILE:
${currentFilePath}

Return exactly one JSON object:

{
  "filePath": "${currentFilePath}",
  "code": "COMPLETE UPDATED FILE CONTENT"
}

The "code" value MUST contain the complete source file.

Do not put markdown inside the code.

Do not add any text outside the JSON object.`;
}

function validateGeneratedCode(
  code: string,
  existingCode: string,
  prompt: string
): void {
  const normalized = code.trim();
  const lowerPrompt = prompt.toLowerCase();

  const isSimpleRequest =
    lowerPrompt.includes('button') ||
    lowerPrompt.includes('text') ||
    lowerPrompt.includes('heading') ||
    lowerPrompt.includes('title') ||
    lowerPrompt.includes('color') ||
    lowerPrompt.includes('css') ||
    lowerPrompt.includes('style') ||
    lowerPrompt.includes('ui') ||
    lowerPrompt.includes('design') ||
    lowerPrompt.includes('add ');

  if (
    existingCode.includes('"use client"') ||
    existingCode.includes("'use client'")
  ) {
    if (
      !normalized.startsWith('"use client";') &&
      !normalized.startsWith("'use client';") &&
      !normalized.startsWith('"use client"\n') &&
      !normalized.startsWith("'use client'\n")
    ) {
      throw new Error(
        'Generated code invalid: "use client" is not the first statement.'
      );
    }
  }

  if (isSimpleRequest) {
    const forbiddenPatterns = [
      '"use server"',
      "'use server'",
      'useFormState(',
      'useFormStatus(',
      'useActionState(',
      'submitForm',
      'async function submit',
      'async function action'
    ];

    for (const pattern of forbiddenPatterns) {
      if (
        normalized.includes(pattern) &&
        !existingCode.includes(pattern)
      ) {
        throw new Error(
          `AI added unnecessary architecture for a simple UI request: ${pattern}`
        );
      }
    }
  }
}

export async function generateCodeWithAI(
  prompt: string,
  existingCode: string = '',
  currentFilePath: string = 'app/page.tsx',
  provider: AIProvider = 'gemini',
  modelName?: string,
  customKey?: string
): Promise<{
  filePath: string;
  code: string;
}> {
  try {
    const model =
      modelName ||
      (provider === 'groq'
        ? DEFAULT_GROQ_MODEL
        : DEFAULT_GEMINI_MODEL);

    const codingPrompt = buildCodingPrompt(
      prompt,
      existingCode,
      currentFilePath
    );

    let rawText = '';

    if (provider === 'groq') {
      if (!customKey) {
        throw new Error(
          'Groq API Key পাওয়া যায়নি!'
        );
      }

      rawText = await groqRequest(
        model,
        codingPrompt,
        customKey
      );
    } else {
      const ai = await getGenAIClient(customKey);

      const response =
        await ai.models.generateContent({
          model,
          config: {
            responseMimeType: 'application/json'
          },
          contents: codingPrompt
        });

      rawText =
        typeof response.text === 'function'
          ? response.text()
          : response.text || '';
    }

    if (!rawText.trim()) {
      throw new Error(
        'AI কোনো code response দেয়নি।'
      );
    }

    const cleanText = cleanAIJson(rawText);

    let result: any;

    try {
      result = JSON.parse(cleanText);
    } catch {
      console.error(
        'AI RAW RESPONSE:',
        rawText
      );

      console.error(
        'CLEAN JSON:',
        cleanText
      );

      throw new Error(
        'AI-এর response valid JSON নয়।'
      );
    }

    if (
      !result ||
      typeof result !== 'object'
    ) {
      throw new Error(
        'AI response-এর format সঠিক নয়।'
      );
    }

    if (
      typeof result.filePath !== 'string'
    ) {
      result.filePath =
        currentFilePath;
    }

    if (
      typeof result.code !== 'string'
    ) {
      throw new Error(
        'AI response-এ valid code পাওয়া যায়নি।'
      );
    }

    result.code = cleanGeneratedCode(
      result.code
    );

    if (!result.code.trim()) {
      throw new Error(
        'AI response থেকে valid code পাওয়া যায়নি।'
      );
    }

    validateGeneratedCode(
      result.code,
      existingCode,
      prompt
    );

    return {
      filePath: currentFilePath,
      code: result.code
    };
  } catch (error: any) {
    if (
      error?.message?.includes('429')
    ) {
      throw new Error(
        'API Rate Limit (429) শেষ হয়েছে! অন্য API Key অথবা অন্য Model ব্যবহার করুন।'
      );
    }

    throw new Error(
      `AI কোড জেনারেট করতে ব্যর্থ হয়েছে: ${
        error?.message || error
      }`
    );
  }
}

export async function getEmbedding(
  text: string,
  customKey?: string
): Promise<number[] | null> {
  try {
    const ai = await getGenAIClient(
      customKey
    );

    const response =
      await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text
      });

    if (
      response.embeddings &&
      response.embeddings.length > 0 &&
      response.embeddings[0].values
    ) {
      return response.embeddings[0].values;
    }

    if (
      response.embedding &&
      response.embedding.values
    ) {
      return response.embedding.values;
    }

    return null;
  } catch (error) {
    console.error(
      'Embedding Warning:',
      error
    );

    return null;
  }
}