import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createHash } from 'crypto';

dotenv.config({
  path: path.resolve(__dirname, '../.env')
});

const SUPABASE_URL =
  process.env.SUPABASE_URL || '';

const SUPABASE_KEY =
  process.env.SUPABASE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'SUPABASE_URL বা SUPABASE_KEY পাওয়া যায়নি।'
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


// ==================================================
// MEMORY SEARCH
// ==================================================

export async function searchInMemory(
  embedding: number[]
) {

  const {
    data,
    error
  } = await supabase.rpc(
    'match_snippets',
    {
      query_embedding: embedding,
      match_threshold: 0.82,
      match_count: 1
    }
  );

  if (error) {
    console.error(
      'ODX Memory search error:',
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


// ==================================================
// KNOWLEDGE SEARCH
// ==================================================

export async function searchKnowledge(
  embedding: number[]
) {

  const {
    data,
    error
  } = await supabase.rpc(
    'match_snippets',
    {
      query_embedding: embedding,
      match_threshold: 0.82,
      match_count: 5
    }
  );

  if (error) {
    console.error(
      'ODX Knowledge search error:',
      error
    );

    return [];
  }

  if (
    !data ||
    data.length === 0
  ) {
    return [];
  }

  return data;
}


// ==================================================
// SAVE SUCCESSFUL CODE TO MEMORY
// ==================================================

export async function saveToMemory(
  prompt: string,
  filePath: string,
  code: string,
  embedding: number[]
): Promise<boolean> {

  try {

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
      return false;
    }


    // ----------------------------------------------
    // Duplicate fingerprint
    // ----------------------------------------------

    const fingerprint =
      createHash('sha256')
        .update(
          [
            normalizedPrompt,
            normalizedFilePath,
            normalizedCode
          ].join('\n')
        )
        .digest('hex');


    // ----------------------------------------------
    // Existing exact entry check
    // ----------------------------------------------

    const {
      data: existing,
      error: existingError
    } = await supabase
      .from('agent_memory')
      .select(
        'id,prompt,file_path,code_content'
      )
      .eq(
        'prompt',
        normalizedPrompt
      )
      .eq(
        'file_path',
        normalizedFilePath
      )
      .eq(
        'code_content',
        normalizedCode
      )
      .limit(1);

    if (existingError) {

      console.error(
        'ODX Memory duplicate check error:',
        existingError
      );

    } else if (
      existing &&
      existing.length > 0
    ) {

      console.log(
        `ODX Memory duplicate skipped: ${fingerprint}`
      );

      return true;
    }


    // ----------------------------------------------
    // Save
    // ----------------------------------------------

    const {
      error
    } = await supabase
      .from('agent_memory')
      .insert([
        {
          prompt:
            normalizedPrompt,

          file_path:
            normalizedFilePath,

          code_content:
            normalizedCode,

          embedding
        }
      ]);


    if (error) {

      console.error(
        'ODX Memory save error:',
        error
      );

      return false;
    }


    console.log(
      `ODX Memory saved: ${fingerprint}`
    );

    return true;

  } catch (error) {

    console.error(
      'ODX Memory unexpected error:',
      error
    );

    return false;
  }
}