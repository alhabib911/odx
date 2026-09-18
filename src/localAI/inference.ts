import {
  ODXLocalModel,
  LocalModelConfig
} from './model';

import {
  createEmbedding
} from '../embedding';

import {
  searchKnowledge
} from '../supabase';

import {
  searchOpenKnowledge
} from '../openKnowledge';


export interface LocalInferenceResult {
  success: boolean;
  code: string;
  message: string;
  knowledge: string;
  knowledgeSource: string;
}


export class ODXInference {

  private model: ODXLocalModel;


  constructor() {

    const config: LocalModelConfig = {
      modelName: 'odx-brain',
      contextSize: 4096,
      temperature: 0.1
    };

    this.model =
      new ODXLocalModel(config);
  }


  // ==================================================
  // INITIALIZE
  // ==================================================

  async initialize(): Promise<void> {
    await this.model.load();
  }


  // ==================================================
  // GENERATE CODE
  // ==================================================

  async generateCode(
    prompt: string,
    geminiApiKey?: string
  ): Promise<LocalInferenceResult> {

    let knowledgeText = '';
    let knowledgeSource = '';


    // ==================================================
    // 1. ODX KNOWLEDGE
    // ==================================================

    if (geminiApiKey) {

      try {

        console.log(
          '🔎 ODX Knowledge search শুরু...'
        );

        const embedding =
          await createEmbedding(
            prompt,
            geminiApiKey
          );

        const knowledge =
          await searchKnowledge(
            embedding
          );

        if (
          knowledge &&
          knowledge.length > 0
        ) {

          knowledgeText =
            knowledge
              .map(
                (item: any) =>
                  item.content ||
                  item.code_content ||
                  item.knowledge ||
                  ''
              )
              .filter(
                (text: string) =>
                  text.trim().length > 0
              )
              .join('\n\n');

          if (knowledgeText) {

            knowledgeSource =
              'ODX Knowledge';

            console.log(
              '✅ ODX Knowledge পাওয়া গেছে।'
            );
          }
        }

      } catch (error) {

        console.log(
          '⚠️ ODX Knowledge search failed:',
          error
        );
      }
    }


    // ==================================================
    // 2. OPEN KNOWLEDGE FALLBACK
    // ==================================================

    if (!knowledgeText) {

      try {

        console.log(
          '🌐 ODX Knowledge পাওয়া যায়নি। Open Knowledge search করা হচ্ছে...'
        );

        const openResults =
          await searchOpenKnowledge(
            prompt
          );

        if (
          openResults &&
          openResults.length > 0
        ) {

          knowledgeText =
            openResults
              .map(
                (item) =>
                  [
                    `Title: ${item.title}`,
                    `Content: ${item.content}`,
                    `Source: ${item.source}`,
                    item.url
                      ? `URL: ${item.url}`
                      : ''
                  ]
                    .filter(Boolean)
                    .join('\n')
              )
              .join('\n\n');

          knowledgeSource =
            'Open Knowledge';

          console.log(
            `✅ Open Knowledge থেকে ${openResults.length}টি source পাওয়া গেছে।`
          );
        }

      } catch (error) {

        console.error(
          '❌ Open Knowledge search failed:',
          error
        );
      }
    }


    // ==================================================
    // 3. LOCAL BRAIN PROMPT
    // ==================================================

    const fullPrompt = `
User request:
${prompt}

Knowledge source:
${knowledgeSource || 'None'}

Knowledge:
${knowledgeText || 'No knowledge found.'}

Task:
Generate the required code for the user request.

Rules:
- Use the provided knowledge when relevant.
- Do not invent unnecessary APIs or libraries.
- Keep the implementation as simple as possible.
- Return only the final code.
`.trim();


    // ==================================================
    // 4. LOCAL BRAIN
    // ==================================================

    try {

      console.log(
        '🧠 ODX Local Brain code generation শুরু...'
      );

      const result =
        await this.model.generate(
          fullPrompt
        );


      if (
        !result.success ||
        !result.text.trim()
      ) {

        return {
          success: false,
          code: '',
          message:
            'ODX Local Brain could not generate code.',
          knowledge:
            knowledgeText,
          knowledgeSource
        };
      }


      console.log(
        '✅ ODX Local Brain code generated.'
      );


      return {
        success: true,
        code: result.text.trim(),
        message:
          knowledgeSource
            ? `Local Brain generated code using ${knowledgeSource}.`
            : 'Local Brain generated code without external knowledge.',
        knowledge:
          knowledgeText,
        knowledgeSource
      };


    } catch (error) {

      console.error(
        '❌ ODX Local Brain error:',
        error
      );


      return {
        success: false,
        code: '',
        message:
          'ODX Local Brain failed.',
        knowledge:
          knowledgeText,
        knowledgeSource
      };
    }
  }


  // ==================================================
  // READY
  // ==================================================

  isReady(): boolean {
    return this.model.isLoaded();
  }


  // ==================================================
  // UNLOAD
  // ==================================================

  unload(): void {
    this.model.unload();
  }
}