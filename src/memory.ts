import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config({
  path: path.resolve(__dirname, '../.env')
});

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  'https://pokddfygdilmtgirjqom.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_KEY || '';

if (!SUPABASE_KEY) {
  throw new Error(
    'SUPABASE_KEY পাওয়া যায়নি। .env ফাইল চেক করুন।'
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

function createContentHash(
  prompt: string,
  filePath: string,
  code: string
): string {
  const normalizedContent = [
    prompt.trim().toLowerCase(),
    filePath.trim().toLowerCase(),
    code.trim()
  ].join('|');

  return createHash('sha256')
    .update(
      normalizedContent,
      'utf8'
    )
    .digest('hex');
}

function sanitizeSearchWord(
  word: string
): string {
  return word
    .trim()
    .replace(
      /[^\p{L}\p{N}_%\\-]+/gu,
      ''
    )
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .trim();
}

export async function searchTextInMemory(
  prompt: string
) {
  const rawWords =
    prompt
      .toLowerCase()
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 2
      );

  const words =
    Array.from(
      new Set(
        rawWords
          .map(
            sanitizeSearchWord
          )
          .filter(
            (word) =>
              word.length > 2
          )
      )
    );

  if (
    words.length === 0
  ) {
    return null;
  }

  const conditions =
    words.flatMap(
      (word) => [
        `prompt.ilike.*${word}*`,
        `code_content.ilike.*${word}*`
      ]
    );

  const {
    data,
    error
  } =
    await supabase
      .from('agent_memory')
      .select(
        `
        id,
        prompt,
        file_path,
        code_content,
        created_at,
        content_hash
        `
      )
      .or(
        conditions.join(',')
      )
      .limit(5);

  if (error) {
    console.error(
      'Text memory search error:',
      error
    );

    vscode.window.showErrorMessage(
      `SUPABASE TEXT SEARCH ERROR: ${error.message}`
    );

    return null;
  }

  if (
    !data ||
    data.length === 0
  ) {
    return null;
  }

  return data;
}

export async function searchVectorInMemory(
  embedding?: number[]
) {
  if (
    !embedding ||
    embedding.length === 0
  ) {
    return null;
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      'match_snippets',
      {
        query_embedding:
          embedding,
        match_threshold:
          0.82,
        match_count:
          5
      }
    );

  if (error) {
    console.error(
      'Vector memory search error:',
      error
    );

    return null;
  }

  if (
    !data ||
    data.length === 0
  ) {
    return null;
  }

  return data;
}

export async function searchInMemory(
  prompt: string,
  embedding?: number[]
) {
  const textResults =
    await searchTextInMemory(
      prompt
    );

  const vectorResults =
    await searchVectorInMemory(
      embedding
    );

  return {
    textResults:
      textResults || [],
    vectorResults:
      vectorResults || []
  };
}

/*
 * =====================================================
 * SEMANTIC DUPLICATE CHECK
 * =====================================================
 */

async function findSemanticDuplicate(
  embedding?: number[]
) {
  if (
    !embedding ||
    embedding.length === 0
  ) {
    return null;
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      'match_snippets',
      {
        query_embedding:
          embedding,

        // High threshold:
        // very similar knowledge only.
        match_threshold:
          0.94,

        match_count:
          1
      }
    );

  if (error) {
    console.error(
      'Semantic duplicate check error:',
      error
    );

    return null;
  }

  if (
    !data ||
    data.length === 0
  ) {
    return null;
  }

  return data[0];
}

/*
 * =====================================================
 * SAVE MEMORY
 * =====================================================
 */

export async function saveToMemory(
  prompt: string,
  filePath: string,
  code: string,
  embedding?: number[]
) {
  const normalizedPrompt =
    prompt.trim();

  const normalizedFilePath =
    filePath.trim();

  const normalizedCode =
    code.trim();

  if (
    !normalizedPrompt ||
    !normalizedCode
  ) {
    throw new Error(
      'Memory save-এর জন্য prompt এবং code প্রয়োজন।'
    );
  }

  const contentHash =
    createContentHash(
      normalizedPrompt,
      normalizedFilePath,
      normalizedCode
    );

  /*
   * ==================================================
   * 1. EXACT DUPLICATE CHECK
   * ==================================================
   */

  const {
    data: existingMemory,
    error: checkError
  } =
    await supabase
      .from('agent_memory')
      .select(
        'id'
      )
      .eq(
        'content_hash',
        contentHash
      )
      .limit(1);

  if (checkError) {
    console.error(
      'Duplicate memory check error:',
      checkError
    );

    throw new Error(
      `Memory duplicate check failed: ${checkError.message}`
    );
  }

  if (
    existingMemory &&
    existingMemory.length > 0
  ) {
    console.log(
      'Exact duplicate memory skipped:',
      contentHash
    );

    vscode.window.showInformationMessage(
      '🧠 Exact duplicate knowledge detected. Save skipped.'
    );

    return existingMemory;
  }

  /*
   * ==================================================
   * 2. SEMANTIC DUPLICATE CHECK
   * ==================================================
   */

  if (
    embedding &&
    embedding.length > 0
  ) {
    const semanticDuplicate =
      await findSemanticDuplicate(
        embedding
      );

    if (
      semanticDuplicate
    ) {
      console.log(
        'Semantic duplicate memory skipped:',
        {
          existingId:
            semanticDuplicate.id,
          existingPrompt:
            semanticDuplicate.prompt,
          existingFile:
            semanticDuplicate.file_path
        }
      );

      vscode.window.showInformationMessage(
        '🧠 Similar knowledge already exists. New duplicate save skipped.'
      );

      return [
        semanticDuplicate
      ];
    }
  }

  /*
   * ==================================================
   * 3. PREPARE MEMORY DATA
   * ==================================================
   */

  const memoryData: {
    prompt: string;
    file_path: string;
    code_content: string;
    content_hash: string;
    embedding?: number[];
  } = {
    prompt:
      normalizedPrompt,

    file_path:
      normalizedFilePath,

    code_content:
      normalizedCode,

    content_hash:
      contentHash
  };

  if (
    embedding &&
    embedding.length > 0
  ) {
    memoryData.embedding =
      embedding;
  }

  /*
   * ==================================================
   * 4. INSERT
   * ==================================================
   */

  const {
    data,
    error
  } =
    await supabase
      .from('agent_memory')
      .insert([
        memoryData
      ])
      .select();

  if (error) {
    /*
     * PostgreSQL unique violation.
     */
    if (
      error.code ===
      '23505'
    ) {
      vscode.window.showInformationMessage(
        '🧠 Duplicate knowledge detected. Memory save skipped.'
      );

      return [];
    }

    console.error(
      'SUPABASE MEMORY SAVE ERROR:',
      error
    );

    vscode.window.showErrorMessage(
      `SUPABASE ERROR: ${error.message}`
    );

    throw new Error(
      `Memory save failed: ${error.message}`
    );
  }

  /*
   * ==================================================
   * 5. SUCCESS
   * ==================================================
   */

  console.log(
    'Memory saved successfully:',
    data
  );

  vscode.window.showInformationMessage(
    '🧠 New knowledge successfully saved to Supabase!'
  );

  return data;
}